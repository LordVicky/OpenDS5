# SPDX-License-Identifier: MIT

param(
  [ValidateSet("all", "vds_usb", "vds_filter")]
  [string]$Target = "all",
  [string]$PackageDir = ""
)

$ErrorActionPreference = "Stop"

$WindrvDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-ReloadTargets {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TargetName
  )

  if ($TargetName -eq "all") {
    return @("vds_usb", "vds_filter")
  }
  return @($TargetName)
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

function Reload-VdsUsb {
  param(
    [string]$UsbPackageDir = ""
  )

  if ([string]::IsNullOrWhiteSpace($UsbPackageDir)) {
    $UsbPackageDir = Join-Path (Join-Path $WindrvDir "vds_usb") "package"
  }

  if (!(Test-Path (Join-Path $UsbPackageDir "vds_usb.inf"))) {
    throw "packaged vDS USB INF not found: $UsbPackageDir"
  }

  Push-Location $UsbPackageDir
  try {
    $Device = Get-PnpDevice |
      Where-Object {
      Test-VdsUsbRootDevice $_
    } |
      Select-Object -First 1
    if (!$Device) {
      $Devgen = (Get-Command devgen).Source
      & $Devgen /add /bus ROOT /instanceid "VDSUSB0" /hardwareid "Root\VDSUSB" | Out-Host
      if ($LASTEXITCODE -ne 0) {
        throw "devgen failed with exit code $LASTEXITCODE"
      }

      $Devcon = (Get-Command devcon).Source
      & $Devcon update "vds_usb.inf" "Root\VDSUSB" | Out-Host
      if ($LASTEXITCODE -ne 0) {
        throw "devcon update failed with exit code $LASTEXITCODE"
      }

      $Device = Get-PnpDevice |
        Where-Object {
        Test-VdsUsbRootDevice $_
      } |
        Select-Object -First 1
    }

    if (!$Device) {
      throw "vDS USB root device was not found after device install"
    }

    pnputil /restart-device $Device.InstanceId | Out-Host
    if ($LASTEXITCODE -eq 3010) {
      Write-Warning "pnputil restart-device requested a reboot to complete installation."
      $global:LASTEXITCODE = 0
    } elseif ($LASTEXITCODE -ne 0) {
      throw "pnputil restart-device failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Reload-VdsFilter {
  # Bluetooth Classic HID service UUID 0x1124 in Bluetooth base UUID form.
  # Windows Bluetooth HID instance IDs embed this UUID before VID/PID fields.
  $BtHidServiceGuid = "00001124-0000-1000-8000-00805F9B34FB"

  Get-PnpDevice |
    Where-Object {
    $_.InstanceId -like "HID\{$BtHidServiceGuid}_VID&0002054C_PID&0CE6*" -or
    $_.InstanceId -like "HID\{$BtHidServiceGuid}_VID&0002054C_PID&0DF2*"
  } |
    ForEach-Object {
    Write-Output "Restarting Bluetooth HID device $($_.InstanceId)"
    pnputil /restart-device $_.InstanceId | Out-Host
    if ($LASTEXITCODE -ne 0) {
      $RestartExitCode = $LASTEXITCODE
      Write-Warning "pnputil restart-device failed with exit code $RestartExitCode"
      $global:LASTEXITCODE = 0
      Write-Warning "Removing stale Bluetooth HID device $($_.InstanceId) so it can re-enumerate with the current vds_filter package."
      pnputil /remove-device $_.InstanceId | Out-Host
      if ($LASTEXITCODE -eq 3010) {
        Write-Warning "pnputil requested a reboot while removing stale Bluetooth HID device $($_.InstanceId)."
        $global:LASTEXITCODE = 0
      } elseif ($LASTEXITCODE -ne 0) {
        Write-Warning "pnputil remove-device failed with exit code $LASTEXITCODE"
        $global:LASTEXITCODE = 0
      }
      pnputil /scan-devices | Out-Host
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "pnputil scan-devices failed with exit code $LASTEXITCODE"
        $global:LASTEXITCODE = 0
      }
    }
  }
}

foreach ($ReloadTarget in (Resolve-ReloadTargets -TargetName $Target)) {
  if ($ReloadTarget -eq "vds_usb") {
    Reload-VdsUsb -UsbPackageDir $PackageDir
  } elseif ($ReloadTarget -eq "vds_filter") {
    Reload-VdsFilter
  }
}
