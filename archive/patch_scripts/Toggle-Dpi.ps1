$setDpiExe = "C:\Users\624\tools\SetDpi.exe"
try {
    $current = [int]((& $setDpiExe value 2>$null).Trim())
} catch {
    $current = 100
}

if ($current -eq 175) {
    & $setDpiExe 100
} else {
    & $setDpiExe 175
}
