param(
  [Parameter(Mandatory = $true)][string]$Mark,
  [Parameter(Mandatory = $true)][string]$TransparentLockup,
  [Parameter(Mandatory = $true)][string]$LightLockup
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot '..\assets\brand'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function Get-VisibleBounds([System.Drawing.Bitmap]$image, [bool]$useAlpha) {
  $left = $image.Width
  $top = $image.Height
  $right = -1
  $bottom = -1
  for ($y = 0; $y -lt $image.Height; $y++) {
    for ($x = 0; $x -lt $image.Width; $x++) {
      $pixel = $image.GetPixel($x, $y)
      $visible = if ($useAlpha) {
        $pixel.A -gt 8
      } else {
        $pixel.R -lt 247 -or $pixel.G -lt 247 -or $pixel.B -lt 247
      }
      if ($visible) {
        if ($x -lt $left) { $left = $x }
        if ($x -gt $right) { $right = $x }
        if ($y -lt $top) { $top = $y }
        if ($y -gt $bottom) { $bottom = $y }
      }
    }
  }
  if ($right -lt $left -or $bottom -lt $top) { throw 'The source image contains no visible pixels.' }
  return [System.Drawing.Rectangle]::FromLTRB($left, $top, $right + 1, $bottom + 1)
}

function Save-CroppedPng([string]$source, [string]$target, [bool]$useAlpha, [int]$padding) {
  $image = [System.Drawing.Bitmap]::FromFile($source)
  try {
    $bounds = Get-VisibleBounds $image $useAlpha
    $x = [Math]::Max(0, $bounds.X - $padding)
    $y = [Math]::Max(0, $bounds.Y - $padding)
    $right = [Math]::Min($image.Width, $bounds.Right + $padding)
    $bottom = [Math]::Min($image.Height, $bounds.Bottom + $padding)
    $crop = [System.Drawing.Rectangle]::FromLTRB($x, $y, $right, $bottom)
    $bitmap = New-Object System.Drawing.Bitmap($crop.Width, $crop.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($image, [System.Drawing.Rectangle]::new(0, 0, $crop.Width, $crop.Height), $crop, [System.Drawing.GraphicsUnit]::Pixel)
      } finally { $graphics.Dispose() }
      $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
  } finally { $image.Dispose() }
}

function Save-SquareIcon([string]$source, [string]$target, [int]$size, [double]$widthRatio) {
  $image = [System.Drawing.Bitmap]::FromFile($source)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $width = [int]($size * $widthRatio)
        $height = [int]($width * $image.Height / $image.Width)
        if ($height -gt [int]($size * .9)) {
          $height = [int]($size * .9)
          $width = [int]($height * $image.Width / $image.Height)
        }
        $x = [int](($size - $width) / 2)
        $y = [int](($size - $height) / 2)
        $graphics.DrawImage($image, $x, $y, $width, $height)
      } finally { $graphics.Dispose() }
      $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
  } finally { $image.Dispose() }
}

$markPath = Join-Path $outputDirectory 'formosa-mark.png'
$lockupPath = Join-Path $outputDirectory 'formosa-lockup.png'
$lightLockupPath = Join-Path $outputDirectory 'formosa-lockup-light.png'
Save-CroppedPng $Mark $markPath $true 4
Save-CroppedPng $TransparentLockup $lockupPath $true 12
Save-CroppedPng $LightLockup $lightLockupPath $false 24

Save-SquareIcon $markPath (Join-Path $PSScriptRoot '..\favicon.png') 512 .9
Save-SquareIcon $markPath (Join-Path $PSScriptRoot '..\favicon-192.png') 192 .9
Save-SquareIcon $markPath (Join-Path $PSScriptRoot '..\apple-touch-icon.png') 180 .86
Save-SquareIcon $markPath (Join-Path $PSScriptRoot '..\favicon-48.png') 48 .88

# ICO container with a PNG payload, supported by current browsers and crawlers.
$pngPath = Join-Path $PSScriptRoot '..\favicon-192.png'
$png = [IO.File]::ReadAllBytes($pngPath)
$stream = New-Object IO.MemoryStream
$writer = New-Object IO.BinaryWriter($stream)
try {
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]1)
  $writer.Write([Byte]192)
  $writer.Write([Byte]192)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$png.Length)
  $writer.Write([UInt32]22)
  $writer.Write($png)
  [IO.File]::WriteAllBytes((Join-Path $PSScriptRoot '..\favicon.ico'), $stream.ToArray())
} finally {
  $writer.Dispose()
  $stream.Dispose()
}

Get-ChildItem $outputDirectory, (Join-Path $PSScriptRoot '..') -File |
  Where-Object { $_.Name -match '^(formosa-|favicon|apple-touch)' } |
  Select-Object FullName, Length
