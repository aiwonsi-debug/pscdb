$setDpi = "$HOME\tools\SetDpi.exe"
$current = (& $setDpi value).Trim()
if ($current -eq "100") {
    & $setDpi 200
} else {
    & $setDpi 100
}
