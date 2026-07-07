# SPDX-License-Identifier: MIT

param(
  [ValidateSet("all", "vds_usb", "vds_filter")]
  [string]$Target = "all",
  [switch]$SkipReload,
  [switch]$SkipRemovePrevious
)

$ErrorActionPreference = "Stop"

$WindrvDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function New-TargetSpecs {
  $UsbDir = Join-Path $WindrvDir "vds_usb"
  $FilterDir = Join-Path $WindrvDir "vds_filter"

  return [ordered]@{
    vds_usb = [pscustomobject]@{
      Name = "vds_usb"
      DisplayName = "vDS virtual USB"
      InfName = "vds_usb.inf"
      ServiceName = "vds_usb"
      DriverFile = "vds_usb.sys"
      PackageDir = Join-Path $UsbDir "package"
      RegistrySettings = Join-Path $UsbDir "vds_usb.reg"
      AllowPnPExit259 = $true
    }
    vds_filter = [pscustomobject]@{
      Name = "vds_filter"
      DisplayName = "vDS filter"
      InfName = "vds_filter.inf"
      ServiceName = "vds_filter"
      DriverFile = "vds_filter.sys"
      PackageDir = Join-Path $FilterDir "package"
      RegistrySettings = ""
      AllowPnPExit259 = $true
    }
  }
}

function Resolve-TargetSpecs {
  param(
    [Parameter(Mandatory = $true)]
    $Specs,
    [Parameter(Mandatory = $true)]
    [string]$TargetName
  )

  if ($TargetName -eq "all") {
    return @($Specs["vds_usb"], $Specs["vds_filter"])
  }
  return @($Specs[$TargetName])
}

function Remove-PnpDriverByOriginalName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$OriginalName,
    [bool]$UninstallDevices = $true
  )

  $Removed = $false
  Get-WindowsDriver -Online -All -ErrorAction SilentlyContinue |
    Where-Object {
    $_.Driver -and
    $_.OriginalFileName -and
    (Split-Path $_.OriginalFileName -Leaf).Equals(
    $OriginalName, [System.StringComparison]::OrdinalIgnoreCase)
  } |
    ForEach-Object {
    Write-Output "Removing driver package $($_.Driver) ($OriginalName)"
    $PnpUtilArgs = @("/delete-driver", $_.Driver)
    if ($UninstallDevices) {
      $PnpUtilArgs += @("/uninstall", "/force")
    }
    pnputil @PnpUtilArgs | Out-Host
    if ($LASTEXITCODE -eq 3010) {
      Write-Warning "pnputil requested a reboot while removing $($_.Driver)."
      $global:LASTEXITCODE = 0
    } elseif ($LASTEXITCODE -ne 0) {
      if (!$UninstallDevices) {
        Write-Warning "pnputil could not remove in-use package $($_.Driver) without touching devices."
        $global:LASTEXITCODE = 0
        return
      }
      throw "pnputil delete-driver failed with exit code $LASTEXITCODE"
    }
    $Removed = $true
  }
  if ($Removed) {
    return
  }

  $PublishedName = $null
  foreach ($Line in (pnputil /enum-drivers)) {
    if ($Line -match "Published Name\s*:\s*(\S+)") {
      $PublishedName = $Matches[1]
      continue
    }
    if ($Line -match "Original Name\s*:\s*(\S+)" -and
    $Matches[1].Equals($OriginalName, [System.StringComparison]::OrdinalIgnoreCase) -and
    $PublishedName) {
      Write-Output "Removing driver package $PublishedName ($OriginalName)"
      $PnpUtilArgs = @("/delete-driver", $PublishedName)
      if ($UninstallDevices) {
        $PnpUtilArgs += @("/uninstall", "/force")
      }
      pnputil @PnpUtilArgs | Out-Host
      if ($LASTEXITCODE -eq 3010) {
        Write-Warning "pnputil requested a reboot while removing $PublishedName."
        $global:LASTEXITCODE = 0
      } elseif ($LASTEXITCODE -ne 0) {
        if (!$UninstallDevices) {
          Write-Warning "pnputil could not remove in-use package $PublishedName without touching devices."
          $global:LASTEXITCODE = 0
          $PublishedName = $null
          continue
        }
        throw "pnputil delete-driver failed with exit code $LASTEXITCODE"
      }
      $PublishedName = $null
    }
  }
}

function Remove-ServiceKey {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  & sc.exe query $Name >$null 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Output "Deleting driver service $Name"
    & sc.exe delete $Name | Out-Host
    if ($LASTEXITCODE -eq 1072) {
      throw "driver service $Name is marked for deletion; reboot before reinstalling"
    } elseif ($LASTEXITCODE -ne 0) {
      Write-Warning "sc delete $Name failed with exit code $LASTEXITCODE"
      $global:LASTEXITCODE = 0
    }
    for ($Attempt = 0; $Attempt -lt 20; ++$Attempt) {
      & sc.exe query $Name >$null 2>$null
      if ($LASTEXITCODE -ne 0) {
        $global:LASTEXITCODE = 0
        return
      }
      $global:LASTEXITCODE = 0
      Start-Sleep -Milliseconds 500
    }
    throw "driver service $Name is still present after delete; reboot before reinstalling"
    return
  }
  $global:LASTEXITCODE = 0

  $Path = "HKLM:\SYSTEM\CurrentControlSet\Services\$Name"
  if (Test-Path $Path) {
    Write-Output "Removing orphaned service key $Name"
    Remove-Item -Recurse -Force $Path
  }
}

function Stop-DriverServiceIfPresent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  & sc.exe query $Name >$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    $global:LASTEXITCODE = 0
    return
  }

  Write-Output "Stopping driver service $Name"
  & sc.exe stop $Name | Out-Host
  if ($LASTEXITCODE -ne 0) {
    $global:LASTEXITCODE = 0
  }
  Start-Sleep -Milliseconds 500
}

function Test-VdsUsbRootDevice {
  param(
    [Parameter(Mandatory = $true)]
    $Device
  )

  if ($Device.InstanceId -eq "ROOT\DEVGEN\VDSUSB0" -or
  $Device.FriendlyName -eq "vDS Virtual DualSense USB Root") {
    return $true
  }

  if ($Device.InstanceId -notlike "ROOT\DEVGEN\*" -and
  $Device.InstanceId -notlike "ROOT\USB\*") {
    return $false
  }

  $DeviceRegistryPath = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($Device.InstanceId)"
  try {
    $DeviceProperties = Get-ItemProperty -Path $DeviceRegistryPath -ErrorAction Stop
  } catch {
    return $false
  }

  foreach ($HardwareId in @($DeviceProperties.HardwareID)) {
    if ($HardwareId -ieq "Root\VDSUSB") {
      return $true
    }
  }
  return $false
}

function Remove-VdsUsbRootDevices {
  $RootDevices = Get-PnpDevice -ErrorAction SilentlyContinue |
    Where-Object {
    Test-VdsUsbRootDevice $_
  }
  foreach ($Device in $RootDevices) {
    Write-Output "Removing vDS USB root device $($Device.InstanceId)"
    pnputil /remove-device $Device.InstanceId | Out-Host
    if ($LASTEXITCODE -eq 3010) {
      Write-Warning "pnputil requested a reboot while removing $($Device.InstanceId)."
      $global:LASTEXITCODE = 0
    } elseif ($LASTEXITCODE -ne 0) {
      Write-Warning "pnputil remove-device failed with exit code $LASTEXITCODE"
      $global:LASTEXITCODE = 0
    }
  }
}

function Import-VdsUsbRegistrySettings {
  param(
    [Parameter(Mandatory = $true)]
    $Spec
  )

  if (!(Test-Path $Spec.RegistrySettings)) {
    throw "vDS USB registry settings not found: $($Spec.RegistrySettings)"
  }
  reg.exe import $Spec.RegistrySettings | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "reg import failed with exit code $LASTEXITCODE"
  }

  $JoystickOemEntries = @(
  [pscustomobject]@{
    DeviceKey = "VID_054C&PID_0CE6"
    DeviceName = "DualSense Wireless Controller"
  },
  [pscustomobject]@{
    DeviceKey = "VID_054C&PID_0DF2"
    DeviceName = "DualSense Edge Wireless Controller"
  }
  )
  foreach ($JoystickOemEntry in $JoystickOemEntries) {
    $JoystickOemPaths = @(
    "HKLM:\SYSTEM\CurrentControlSet\Control\MediaProperties\PrivateProperties\Joystick\OEM\$($JoystickOemEntry.DeviceKey)",
    "HKCU:\SYSTEM\CurrentControlSet\Control\MediaProperties\PrivateProperties\Joystick\OEM\$($JoystickOemEntry.DeviceKey)"
    )
    foreach ($JoystickOemPath in $JoystickOemPaths) {
      New-Item -Path $JoystickOemPath -Force | Out-Null
      Set-ItemProperty -Path $JoystickOemPath `
        -Name "OEMName" `
        -Type String `
        -Value $JoystickOemEntry.DeviceName
    }
  }
}

function Resolve-DriverStoreServiceBinary {
  param(
    [Parameter(Mandatory = $true)]
    $Spec
  )

  $Repository = Join-Path $env:SystemRoot "System32\DriverStore\FileRepository"
  $Candidates = Get-ChildItem `
    -Path $Repository `
    -Directory `
    -Filter "$($Spec.InfName)_*" `
    -ErrorAction SilentlyContinue |
    ForEach-Object {
    Join-Path $_.FullName $Spec.DriverFile
  } |
    Where-Object {
    Test-Path $_
  } |
    Sort-Object {
    (Get-Item $_).LastWriteTimeUtc
  } -Descending

  if (!$Candidates) {
    return ""
  }

  $FullPath = [System.IO.Path]::GetFullPath($Candidates[0])
  $SystemRoot = [System.IO.Path]::GetFullPath($env:SystemRoot).TrimEnd("\")
  if ($FullPath.StartsWith($SystemRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return "\SystemRoot" + $FullPath.Substring($SystemRoot.Length)
  }
  return $FullPath
}

function Ensure-VdsFilterServiceLoaded {
  param(
    [Parameter(Mandatory = $true)]
    $Spec
  )

  if ($Spec.Name -ne "vds_filter") {
    return
  }

  & sc.exe query $Spec.ServiceName >$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    $global:LASTEXITCODE = 0
    $ServiceBinary = Resolve-DriverStoreServiceBinary -Spec $Spec
    if ([string]::IsNullOrWhiteSpace($ServiceBinary)) {
      throw "failed to locate $($Spec.DriverFile) in DriverStore"
    }

    Write-Output "Creating driver service $($Spec.ServiceName)"
    & sc.exe create $Spec.ServiceName `
      "type=" "kernel" `
      "start=" "demand" `
      "binPath=" $ServiceBinary `
      "DisplayName=" $Spec.DisplayName | Out-Host
    if ($LASTEXITCODE -eq 1072) {
      Write-Warning "driver service $($Spec.ServiceName) is marked for deletion; reboot is required before it can be recreated."
      $global:LASTEXITCODE = 0
      return
    }
    if ($LASTEXITCODE -ne 0) {
      throw "sc create $($Spec.ServiceName) failed with exit code $LASTEXITCODE"
    }
  } else {
    $global:LASTEXITCODE = 0
  }

  Write-Output "Configuring driver service $($Spec.ServiceName)"
  & sc.exe config $Spec.ServiceName "start=" "demand" | Out-Host
  if ($LASTEXITCODE -eq 1072) {
    Write-Warning "driver service $($Spec.ServiceName) is marked for deletion; reboot is required before it can be configured."
    $global:LASTEXITCODE = 0
    return
  } elseif ($LASTEXITCODE -ne 0) {
    throw "sc config $($Spec.ServiceName) failed with exit code $LASTEXITCODE"
  }

  Write-Output "Starting driver service $($Spec.ServiceName)"
  & sc.exe start $Spec.ServiceName | Out-Host
  if ($LASTEXITCODE -eq 1056) {
    $global:LASTEXITCODE = 0
  } elseif ($LASTEXITCODE -eq 1072) {
    Write-Warning "driver service $($Spec.ServiceName) is marked for deletion; reboot is required before it can be started."
    $global:LASTEXITCODE = 0
  } elseif ($LASTEXITCODE -ne 0) {
    throw "sc start $($Spec.ServiceName) failed with exit code $LASTEXITCODE"
  }
}

function Invoke-VdsDriverReload {
  param(
    [Parameter(Mandatory = $true)]
    $Spec
  )

  if ($SkipReload) {
    Write-Output "Skipped $($Spec.DisplayName) device restart."
    return
  }

  $ReloadScript = Join-Path $WindrvDir "reload.ps1"
  if (Test-Path $ReloadScript) {
    & $ReloadScript -Target $Spec.Name
    return
  }

  if ($Spec.Name -eq "vds_filter") {
    Write-Warning "reload.ps1 is not present; continuing with vds_filter service activation."
    return
  }

  throw "reload.ps1 is required to activate $($Spec.DisplayName)"
}

function Install-TargetPackage {
  param(
    [Parameter(Mandatory = $true)]
    $Spec
  )

  $InfPath = Join-Path $Spec.PackageDir $Spec.InfName
  if (!(Test-Path $InfPath)) {
    throw "packaged INF not found: $InfPath"
  }

  Push-Location $Spec.PackageDir
  try {
    $PnpUtilAddDriverArgs = @("/add-driver", $Spec.InfName, "/install")
    pnputil @PnpUtilAddDriverArgs | Out-Host
    if ($LASTEXITCODE -eq 1072) {
      Write-Warning "pnputil add-driver reported service-marked-for-delete; reboot may be required before the new $($Spec.ServiceName).sys is loaded."
      $global:LASTEXITCODE = 0
    } elseif ($LASTEXITCODE -eq 3010) {
      Write-Warning "pnputil add-driver requested a reboot to complete installation."
      $global:LASTEXITCODE = 0
    } elseif ($Spec.AllowPnPExit259 -and $LASTEXITCODE -eq 259) {
      $global:LASTEXITCODE = 0
    } elseif ($LASTEXITCODE -ne 0) {
      throw "pnputil add-driver failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  if ($Spec.Name -eq "vds_usb") {
    Import-VdsUsbRegistrySettings -Spec $Spec
  }

  Invoke-VdsDriverReload -Spec $Spec
  Ensure-VdsFilterServiceLoaded -Spec $Spec
}

$Specs = New-TargetSpecs
$SelectedSpecs = Resolve-TargetSpecs -Specs $Specs -TargetName $Target
$RemovePrevious = -not $SkipRemovePrevious

if ($RemovePrevious) {
  if (($SelectedSpecs | Where-Object { $_.Name -eq "vds_usb" })) {
    Remove-VdsUsbRootDevices
  }
  foreach ($Spec in $SelectedSpecs) {
    Remove-PnpDriverByOriginalName -OriginalName $Spec.InfName -UninstallDevices $true
  }
  foreach ($Spec in $SelectedSpecs) {
    Stop-DriverServiceIfPresent -Name $Spec.ServiceName
    Remove-ServiceKey -Name $Spec.ServiceName
  }
} else {
  Write-Output "Skipped driver package and device removal."
}

foreach ($Spec in $SelectedSpecs) {
  Install-TargetPackage -Spec $Spec
}

Write-Output "vDS Windows driver package installed."
