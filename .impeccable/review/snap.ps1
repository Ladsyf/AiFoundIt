param([string]$name, [int]$wait = 2)
Start-Sleep $wait
adb shell screencap -p /sdcard/s.png | Out-Null
adb pull /sdcard/s.png "$PSScriptRoot/$name.png" | Out-Null
"$name saved"
