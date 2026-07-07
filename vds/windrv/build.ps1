# SPDX-License-Identifier: MIT

param(
  [ValidateSet("all", "vds_usb", "vds_filter")]
  [string]$Target = "all",
  [string]$DriverVersion = "",
  [string]$DriverDate = ""
)

$ErrorActionPreference = "Stop"

$WindrvDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $WindrvDir
. (Join-Path $RepoRoot "generate_version.ps1")

$DriverVer = Resolve-VdsDriverVer `
  -RepoRoot $RepoRoot `
  -DriverVersion $DriverVersion `
  -DriverDate $DriverDate
$ResolvedDriverDate = $DriverVer.Date
$ResolvedDriverVersion = $DriverVer.Version
Write-Output "Using DriverVer=$ResolvedDriverDate,$ResolvedDriverVersion"

$CertificateSubject = "CN=vDS Test Driver Certificate"
$Configuration = "Debug"
$Platform = "x64"

function New-TargetSpecs {
  $UsbDir = Join-Path $WindrvDir "vds_usb"
  $FilterDir = Join-Path $WindrvDir "vds_filter"

  return [ordered]@{
    vds_usb = [pscustomobject]@{
      Name = "vds_usb"
      DisplayName = "vDS virtual USB"
      ProjectDir = $UsbDir
      ProjectPath = Join-Path $UsbDir "vds_usb.vcxproj"
      InfName = "vds_usb.inf"
      SysName = "vds_usb.sys"
      BuildDir = Join-Path $UsbDir "build\$Platform\$Configuration"
      PackageDir = Join-Path $UsbDir "package"
      RequiresKmdf = $true
      RequiresUde = $true
      ValidateInfContains = "Root\VDSUSB"
    }
    vds_filter = [pscustomobject]@{
      Name = "vds_filter"
      DisplayName = "vDS filter"
      ProjectDir = $FilterDir
      ProjectPath = Join-Path $FilterDir "vds_filter.vcxproj"
      InfName = "vds_filter.inf"
      SysName = "vds_filter.sys"
      BuildDir = Join-Path $FilterDir "build\$Platform\$Configuration"
      PackageDir = Join-Path $FilterDir "package"
      RequiresKmdf = $false
      RequiresUde = $false
      ValidateInfContains = ""
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

function Get-MSBuildPath {
  $VsWhereCommand = Get-Command vswhere.exe -ErrorAction SilentlyContinue
  if ($VsWhereCommand) {
    $VsWhere = $VsWhereCommand.Source
  } else {
    $VsWhereCandidates = @(
    (Join-Path "${env:ProgramFiles(x86)}" "Microsoft Visual Studio\Installer\vswhere.exe"),
    (Join-Path "$env:ProgramFiles" "Microsoft Visual Studio\Installer\vswhere.exe")
    )
    $VsWhere = $VsWhereCandidates |
      Where-Object { Test-Path -LiteralPath $_ } |
      Select-Object -First 1
  }
  if ([string]::IsNullOrWhiteSpace($VsWhere)) {
    throw "vswhere.exe was not found"
  }

  $VsPath = & $VsWhere `
    -latest `
    -products * `
    -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
    -property installationPath
  if (!$VsPath) {
    throw "Visual Studio Build Tools with C++ tools not found"
  }

  $MSBuild = Join-Path $VsPath "MSBuild\Current\Bin\amd64\MSBuild.exe"
  if (!(Test-Path $MSBuild)) {
    $MSBuild = Join-Path $VsPath "MSBuild\Current\Bin\MSBuild.exe"
  }
  if (!(Test-Path $MSBuild)) {
    throw "MSBuild.exe not found"
  }
  return $MSBuild
}

function Get-VersionedDirectories {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath
  )

  if (!(Test-Path -LiteralPath $RootPath)) {
    return @()
  }

  return @(Get-ChildItem -LiteralPath $RootPath -Directory |
    Where-Object { $_.Name -match "^[0-9]+(\.[0-9]+)+$" } |
    Sort-Object @{ Expression = { [version]$_.Name }; Descending = $true })
}

function Test-WindowsKitPaths {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string[]]$RelativePaths
  )

  foreach ($RelativePath in $RelativePaths) {
    if (!(Test-Path -LiteralPath (Join-Path $BasePath $RelativePath))) {
      return $false
    }
  }
  return $true
}

function Test-WindowsKitPatterns {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string[]]$RelativePatterns
  )

  foreach ($RelativePattern in $RelativePatterns) {
    if (!(Test-Path -Path (Join-Path $BasePath $RelativePattern))) {
      return $false
    }
  }
  return $true
}

function Resolve-WindowsUdePaths {
  param(
    [Parameter(Mandatory = $true)]
    [string]$IncludeRoot,
    [Parameter(Mandatory = $true)]
    [string]$LibRoot,
    [Parameter(Mandatory = $true)]
    [string]$KitVersion
  )

  $UdeIncludeRoot = Join-Path $IncludeRoot "$KitVersion\km\ude"
  $UdeLibRoot = Join-Path $LibRoot "$KitVersion\km\$Platform\ude"

  foreach ($Candidate in Get-VersionedDirectories -RootPath $UdeIncludeRoot) {
    $UdeVersion = $Candidate.Name
    $UdeHeader = Join-Path $Candidate.FullName "UdeCx.h"
    $UdeLibDir = Join-Path $UdeLibRoot $UdeVersion
    $UdeLib = Join-Path $UdeLibDir "udecxstub.lib"
    if ((Test-Path -LiteralPath $UdeHeader) -and
    (Test-Path -LiteralPath $UdeLib)) {
      return [pscustomobject]@{
        IncludeDir = $Candidate.FullName
        LibDir = $UdeLibDir
      }
    }
  }

  throw "A matching UDE include/library pair was not found for Windows SDK/WDK $KitVersion"
}

function Get-ProjectKmdfVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath,
    [Parameter(Mandatory = $true)]
    [string]$MSBuildPath
  )

  $Output = & $MSBuildPath `
    $ProjectPath `
    /nologo `
    /t:PrintVdsKmdfVersion `
    /p:Configuration=$Configuration `
    /p:Platform=$Platform `
    /p:WindowsTargetPlatformVersion=$WindowsDriverKitVersion `
    /p:VdsWindowsKernelKitVersion=$WindowsDriverKitVersion `
    /p:SignMode=Off `
    /p:EnableInf2cat=false `
    /p:SkipPackageVerification=true 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "failed to resolve KMDF version for $ProjectPath"
  }

  $OutputText = $Output -join "`n"
  foreach ($Line in $Output) {
    if ($Line -match "VDS_KMDF_VERSION=([0-9]+\.[0-9]+)") {
      return $Matches[1]
    }
  }
  if ($OutputText -match "KMDF_VERSION_MAJOR=([0-9]+)") {
    $MajorVersion = $Matches[1]
    if ($OutputText -match "KMDF_VERSION_MINOR=([0-9]+)") {
      return "$MajorVersion.$($Matches[1])"
    }
  }

  throw "KMDF version was not reported by $ProjectPath"
}

function Resolve-WindowsDriverKitVersion {
  param(
    [switch]$NeedUde
  )

  $BuildRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\build"
  $IncludeRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\Include"
  $LibRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\Lib"

  foreach ($Candidate in Get-VersionedDirectories -RootPath $IncludeRoot) {
    $KitVersion = $Candidate.Name
    $VersionedBuildRoot = Join-Path $BuildRoot $KitVersion
    $VersionedIncludeRoot = Join-Path $IncludeRoot $KitVersion
    $VersionedLibRoot = Join-Path $LibRoot $KitVersion

    if (!(Test-WindowsKitPatterns `
      -BasePath $VersionedBuildRoot `
      -RelativePatterns @(
    "bin\Microsoft.DriverKit.Build.Tasks.*.dll",
    "bin\Microsoft.DriverKit.Build.Tasks.PackageVerifier.*.dll"
    ))) {
      continue
    }

    if (!(Test-WindowsKitPaths `
      -BasePath $VersionedIncludeRoot `
      -RelativePaths @(
    "km\ntddk.h",
    "km\ntifs.h",
    "shared\ntdef.h",
    "um\windows.h"
    ))) {
      continue
    }

    if (!(Test-WindowsKitPaths `
      -BasePath $VersionedLibRoot `
      -RelativePaths @(
    "km\$Platform",
    "um\$Platform"
    ))) {
      continue
    }

    if ($NeedUde) {
      try {
        $null = Resolve-WindowsUdePaths `
          -IncludeRoot $IncludeRoot `
          -LibRoot $LibRoot `
          -KitVersion $KitVersion
      } catch {
        continue
      }
    }

    return $KitVersion
  }

  throw "A complete Windows SDK/WDK installation was not found."
}

function Resolve-WindowsDriverKitPaths {
  param(
    [Parameter(Mandatory = $true)]
    [string]$KitVersion,
    [string]$KmdfVersion = "",
    [switch]$NeedUde
  )

  $IncludeRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\Include"
  $LibRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\Lib"
  $KmdfIncludeRoot = Join-Path $IncludeRoot "wdf\kmdf"
  $KmdfLibRoot = Join-Path $LibRoot "wdf\kmdf"
  $KmdfIncludeDir = ""
  if (![string]::IsNullOrWhiteSpace($KmdfVersion)) {
    if (!(Test-WindowsKitPaths `
      -BasePath $KmdfIncludeRoot `
      -RelativePaths @(
    "$KmdfVersion\wdf.h"
    ))) {
      throw "KMDF header was not found for KMDF $KmdfVersion"
    }
    if (!(Test-WindowsKitPaths `
      -BasePath $KmdfLibRoot `
      -RelativePaths @(
    "$Platform\$KmdfVersion\WdfLdr.lib",
    "$Platform\$KmdfVersion\WdfDriverEntry.lib"
    ))) {
      throw "KMDF libraries were not found for KMDF $KmdfVersion"
    }
    $KmdfIncludeDir = Join-Path $KmdfIncludeRoot $KmdfVersion
  }

  $UdeIncludeDir = ""
  $UdeLibDir = ""
  if ($NeedUde) {
    $UdePaths = Resolve-WindowsUdePaths `
      -IncludeRoot $IncludeRoot `
      -LibRoot $LibRoot `
      -KitVersion $KitVersion
    $UdeIncludeDir = $UdePaths.IncludeDir
    $UdeLibDir = $UdePaths.LibDir
  }

  return [pscustomobject]@{
    KmdfIncludeDir = $KmdfIncludeDir
    UdeIncludeDir = $UdeIncludeDir
    UdeLibDir = $UdeLibDir
  }
}

function Resolve-WindowsKitTool {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ToolName,
    [Parameter(Mandatory = $true)]
    [string]$KitVersion
  )

  $BinRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
  $PreferredPaths = @(
  (Join-Path $BinRoot "$KitVersion\$Platform\$ToolName"),
  (Join-Path $BinRoot "$KitVersion\x64\$ToolName"),
  (Join-Path $BinRoot "$KitVersion\x86\$ToolName")
  )
  foreach ($PreferredPath in $PreferredPaths) {
    if (Test-Path -LiteralPath $PreferredPath) {
      return $PreferredPath
    }
  }

  $Command = Get-Command $ToolName -ErrorAction SilentlyContinue
  if ($Command) {
    return $Command.Source
  }

  $Match = Get-ChildItem `
    -LiteralPath $BinRoot `
    -Recurse `
    -Filter $ToolName `
    -File `
    -ErrorAction SilentlyContinue |
    Sort-Object `
    @{ Expression = { if ($_.FullName -match "\\$Platform\\") { 0 } else { 1 } } },
  @{ Expression = { $_.FullName }; Descending = $true } |
    Select-Object -First 1
  if ($Match) {
    return $Match.FullName
  }

  throw "$ToolName was not found in PATH or Windows Kits."
}

function Ensure-TestCertificate {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Subject
  )

  $Cert = Get-ChildItem Cert:\LocalMachine\My |
    Where-Object { $_.Subject -eq $Subject } |
    Select-Object -First 1
  if ($Cert) {
    return
  }

  $Cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $Subject `
    -CertStoreLocation Cert:\LocalMachine\My `
    -KeyUsage DigitalSignature `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256

  $RootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
  $RootStore.Open("ReadWrite")
  $RootStore.Add($Cert)
  $RootStore.Close()

  $PublisherStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPublisher", "LocalMachine")
  $PublisherStore.Open("ReadWrite")
  $PublisherStore.Add($Cert)
  $PublisherStore.Close()
}

function Build-TargetPackage {
  param(
    [Parameter(Mandatory = $true)]
    $Spec,
    [Parameter(Mandatory = $true)]
    [string]$MSBuildPath,
    [Parameter(Mandatory = $true)]
    [string]$SignToolPath,
    [Parameter(Mandatory = $true)]
    [string]$Inf2CatPath
  )

  Remove-Item -Recurse -Force (Join-Path $Spec.ProjectDir "build") `
    -ErrorAction SilentlyContinue

  $MSBuildArgs = @(
  $Spec.ProjectPath
  "/m"
  "/t:Clean,Build"
  "/p:Configuration=$Configuration"
  "/p:Platform=$Platform"
  "/p:WindowsTargetPlatformVersion=$WindowsDriverKitVersion"
  "/p:VdsWindowsKernelKitVersion=$WindowsDriverKitVersion"
  "/p:SignMode=Off"
  "/p:EnableInf2cat=false"
  "/p:SkipPackageVerification=true"
  )
  if ($Spec.RequiresKmdf) {
    $MSBuildArgs += "/p:VdsWindowsKmdfIncludeDir=$WindowsKmdfIncludeDir"
  }
  if ($Spec.RequiresUde) {
    $MSBuildArgs += "/p:VdsWindowsUdeIncludeDir=$WindowsUdeIncludeDir"
    $MSBuildArgs += "/p:VdsWindowsUdeLibDir=$WindowsUdeLibDir"
  }

  & $MSBuildPath @MSBuildArgs
  if ($LASTEXITCODE -ne 0) {
    throw "$($Spec.Name) build failed with exit code $LASTEXITCODE"
  }

  $SysPath = Join-Path $Spec.BuildDir $Spec.SysName
  if (!(Test-Path $SysPath)) {
    throw "built driver not found: $SysPath"
  }

  Remove-Item -Recurse -Force $Spec.PackageDir -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $Spec.PackageDir | Out-Null
  Copy-Item $SysPath (Join-Path $Spec.PackageDir $Spec.SysName) -Force
  New-VdsStagedInf `
    -TemplatePath (Join-Path $Spec.ProjectDir $Spec.InfName) `
    -OutputPath (Join-Path $Spec.PackageDir $Spec.InfName) `
    -DriverDate $ResolvedDriverDate `
    -DriverVersion $ResolvedDriverVersion

  Push-Location $Spec.PackageDir
  try {
    & $SignToolPath sign /fd SHA256 /sm /s My /n "vDS Test Driver Certificate" $Spec.SysName
    if ($LASTEXITCODE -ne 0) {
      throw "signtool failed with exit code $LASTEXITCODE"
    }

    & $Inf2CatPath /driver:. /os:10_X64 /uselocaltime
    if ($LASTEXITCODE -ne 0) {
      throw "inf2cat failed with exit code $LASTEXITCODE"
    }

    $CatName = [System.IO.Path]::ChangeExtension($Spec.InfName, ".cat")
    & $SignToolPath sign /fd SHA256 /sm /s My /n "vDS Test Driver Certificate" $CatName
    if ($LASTEXITCODE -ne 0) {
      throw "signtool failed with exit code $LASTEXITCODE"
    }

    if (![string]::IsNullOrWhiteSpace($Spec.ValidateInfContains)) {
      $InfText = Get-Content $Spec.InfName -Raw
      if (!$InfText.Contains($Spec.ValidateInfContains)) {
        throw "packaged INF validation failed: $($Spec.InfName)"
      }
    }
  } finally {
    Pop-Location
  }

  Write-Output "$($Spec.DisplayName) package built."
}

$Specs = New-TargetSpecs
$SelectedSpecs = Resolve-TargetSpecs -Specs $Specs -TargetName $Target
$MSBuild = Get-MSBuildPath
$NeedsUde = [bool]($SelectedSpecs | Where-Object { $_.RequiresUde })
$KmdfSpec = $SelectedSpecs |
  Where-Object { $_.RequiresKmdf } |
  Select-Object -First 1
$WindowsDriverKitVersion = Resolve-WindowsDriverKitVersion -NeedUde:$NeedsUde
$WindowsKmdfVersion = ""
if ($KmdfSpec) {
  $WindowsKmdfVersion = Get-ProjectKmdfVersion `
    -ProjectPath $KmdfSpec.ProjectPath `
    -MSBuildPath $MSBuild
}
$WindowsKit = Resolve-WindowsDriverKitPaths `
  -KitVersion $WindowsDriverKitVersion `
  -KmdfVersion $WindowsKmdfVersion `
  -NeedUde:$NeedsUde
$WindowsKmdfIncludeDir = $WindowsKit.KmdfIncludeDir
$WindowsUdeIncludeDir = $WindowsKit.UdeIncludeDir
$WindowsUdeLibDir = $WindowsKit.UdeLibDir
$SignTool = Resolve-WindowsKitTool `
  -ToolName "signtool.exe" `
  -KitVersion $WindowsDriverKitVersion
$Inf2Cat = Resolve-WindowsKitTool `
  -ToolName "inf2cat.exe" `
  -KitVersion $WindowsDriverKitVersion
Write-Output "Using Windows SDK/WDK version=$WindowsDriverKitVersion"
if (![string]::IsNullOrWhiteSpace($WindowsKmdfVersion)) {
  Write-Output "Using Windows KMDF version=$WindowsKmdfVersion"
  Write-Output "Using Windows KMDF include dir=$WindowsKmdfIncludeDir"
}
if ($NeedsUde) {
  Write-Output "Using Windows UDE include dir=$WindowsUdeIncludeDir"
  Write-Output "Using Windows UDE lib dir=$WindowsUdeLibDir"
}
Write-Output "Using signtool=$SignTool"
Write-Output "Using inf2cat=$Inf2Cat"
Ensure-TestCertificate -Subject $CertificateSubject

foreach ($Spec in $SelectedSpecs) {
  Build-TargetPackage `
    -Spec $Spec `
    -MSBuildPath $MSBuild `
    -SignToolPath $SignTool `
    -Inf2CatPath $Inf2Cat
}
