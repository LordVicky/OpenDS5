# SPDX-License-Identifier: MIT

param(
  [ValidateSet("all", "vds_usb", "vds_filter")]
  [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

function New-TargetSpecs {
  return [ordered]@{
    vds_filter = [pscustomobject]@{
      Name = "vds_filter"
      InfName = "vds_filter.inf"
      ServiceName = "vds_filter"
      DriverFile = "vds_filter.sys"
    }
    vds_usb = [pscustomobject]@{
      Name = "vds_usb"
      InfName = "vds_usb.inf"
      ServiceName = "vds_usb"
      DriverFile = "vds_usb.sys"
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
    return @($Specs["vds_filter"], $Specs["vds_usb"])
  }
  return @($Specs[$TargetName])
}

function New-DriverPackageMap {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$OriginalNames
  )

  $DriverPackages = @{}
  foreach ($OriginalName in $OriginalNames) {
    $DriverPackages[$OriginalName] = @()
  }

  Get-WindowsDriver -Online -All -ErrorAction SilentlyContinue |
    Where-Object {
    $_.Driver -and $_.OriginalFileName
  } |
    ForEach-Object {
    $OriginalFileName = Split-Path $_.OriginalFileName -Leaf
    foreach ($OriginalName in $OriginalNames) {
      if ($OriginalFileName.Equals($OriginalName, [System.StringComparison]::OrdinalIgnoreCase)) {
        $DriverPackages[$OriginalName] += $_.Driver
        break
      }
    }
  }

  $Found = $false
  foreach ($OriginalName in $OriginalNames) {
    if ($DriverPackages[$OriginalName].Count -gt 0) {
      $Found = $true
      break
    }
  }
  if ($Found) {
    return $DriverPackages
  }

  $PublishedName = $null
  foreach ($Line in (pnputil /enum-drivers 2>$null)) {
    if ($Line -match "Published Name\s*:\s*(\S+)") {
      $PublishedName = $Matches[1]
      continue
    }
    if ($Line -match "Original Name\s*:\s*(\S+)" -and $PublishedName) {
      foreach ($OriginalName in $OriginalNames) {
        if ($Matches[1].Equals($OriginalName, [System.StringComparison]::OrdinalIgnoreCase)) {
          $DriverPackages[$OriginalName] += $PublishedName
          break
        }
      }
      $PublishedName = $null
    }
  }
  $global:LASTEXITCODE = 0

  return $DriverPackages
}

function Remove-PnpDriverByOriginalName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$OriginalName,
    [string[]]$PublishedNames
  )

  if (!$PublishedNames -or $PublishedNames.Count -eq 0) {
    return
  }

  foreach ($PublishedName in @($PublishedNames | Select-Object -Unique)) {
    Write-Output "Removing driver package $PublishedName ($OriginalName)"
    pnputil /delete-driver $PublishedName /uninstall /force | Out-Host
    if ($LASTEXITCODE -eq 3010) {
      Write-Warning "pnputil requested a reboot while removing $PublishedName."
      $global:LASTEXITCODE = 0
    } elseif ($LASTEXITCODE -ne 0) {
      throw "pnputil delete-driver failed with exit code $LASTEXITCODE"
    }
  }
}

function Test-DriverServicePresent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  & sc.exe query $Name >$null 2>$null
  if ($LASTEXITCODE -eq 0) {
    return $true
  }
  $global:LASTEXITCODE = 0

  return Test-Path "HKLM:\SYSTEM\CurrentControlSet\Services\$Name"
}

function Get-VdsUsbRootDevices {
  return Get-PnpDevice -ErrorAction SilentlyContinue |
    Where-Object {
    Test-VdsUsbRootDevice $_
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
      Write-Warning "driver service $Name is marked for deletion; reboot is required to finish removal."
      $global:LASTEXITCODE = 0
      return
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
    Write-Warning "driver service $Name is still present after delete; reboot is required to finish removal."
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

function Test-DriverImageFilePresent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FileName
  )

  $Path = Join-Path $env:SystemRoot "System32\drivers\$FileName"
  return Test-Path $Path
}

function Remove-DriverImageFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FileName
  )

  $Path = Join-Path $env:SystemRoot "System32\drivers\$FileName"
  if (!(Test-Path $Path)) {
    return
  }

  Write-Output "Removing driver image $Path"
  try {
    Remove-Item -Force $Path
  } catch {
    Write-Warning "failed to remove driver image $Path; reboot may be required"
  }
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
  param(
    [Parameter(Mandatory = $true)]
    $Devices
  )

  foreach ($Device in $Devices) {
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

$Specs = New-TargetSpecs
$SelectedSpecs = Resolve-TargetSpecs -Specs $Specs -TargetName $Target
$DriverPackages = New-DriverPackageMap -OriginalNames @($SelectedSpecs | ForEach-Object { $_.InfName })
$UsbRootDevices = @()

if (($SelectedSpecs | Where-Object { $_.Name -eq "vds_usb" })) {
  $UsbRootDevices = @(Get-VdsUsbRootDevices)
}

$InstalledSpecs = @()
foreach ($Spec in $SelectedSpecs) {
  $PublishedNames = @($DriverPackages[$Spec.InfName])
  $HasService = Test-DriverServicePresent -Name $Spec.ServiceName
  $HasUsbRootDevice = $Spec.Name -eq "vds_usb" -and $UsbRootDevices.Count -gt 0
  $HasDriverImage = Test-DriverImageFilePresent -FileName $Spec.DriverFile
  if ($PublishedNames.Count -eq 0 -and !$HasService -and !$HasUsbRootDevice -and !$HasDriverImage) {
    Write-Output "Skipping $($Spec.Name); it is not installed."
    continue
  }

  $InstalledSpecs += [pscustomobject]@{
    Spec = $Spec
    PublishedNames = $PublishedNames
  }
}

if ($InstalledSpecs.Count -eq 0) {
  Write-Output "No installed vDS Windows driver packages found."
  exit 0
}

if (($InstalledSpecs | Where-Object { $_.Spec.Name -eq "vds_usb" }) -and $UsbRootDevices.Count -gt 0) {
  Remove-VdsUsbRootDevices -Devices $UsbRootDevices
}

foreach ($InstalledSpec in $InstalledSpecs) {
  Remove-PnpDriverByOriginalName `
    -OriginalName $InstalledSpec.Spec.InfName `
    -PublishedNames $InstalledSpec.PublishedNames
}

foreach ($InstalledSpec in $InstalledSpecs) {
  $Spec = $InstalledSpec.Spec
  Stop-DriverServiceIfPresent -Name $Spec.ServiceName
  Remove-ServiceKey -Name $Spec.ServiceName
  Remove-DriverImageFile -FileName $Spec.DriverFile
}

Write-Output "vDS Windows driver package removed."
