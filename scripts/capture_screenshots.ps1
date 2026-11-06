$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) {
    $edge = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
}
Write-Host "Using Edge at: $edge"

$outDir = 'C:\Users\jasma\.gemini\antigravity\brain\c9edf2f7-7ae4-400a-8b94-a4bacaf88ec8'
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$shots = @(
    @{ Name = "landing_page.png"; Url = "http://localhost:3000/?theme=light"; Width = 1440; Height = 900; Delay = 4000 },
    @{ Name = "landing_page_dark.png"; Url = "http://localhost:3000/?theme=dark"; Width = 1440; Height = 900; Delay = 4000 },
    @{ Name = "empty_workspace.png"; Url = "http://localhost:3000/app?theme=light"; Width = 1440; Height = 900; Delay = 4000 },
    @{ Name = "empty_workspace_dark.png"; Url = "http://localhost:3000/app?theme=dark"; Width = 1440; Height = 900; Delay = 4000 },
    @{ Name = "mid_research_timeline.png"; Url = "http://localhost:3000/app?demo=running&theme=light"; Width = 1440; Height = 1050; Delay = 5000 },
    @{ Name = "mid_research_timeline_dark.png"; Url = "http://localhost:3000/app?demo=running&theme=dark"; Width = 1440; Height = 1050; Delay = 5000 },
    @{ Name = "finished_report_with_sources.png"; Url = "http://localhost:3000/app?demo=finished&theme=light"; Width = 1440; Height = 1000; Delay = 5000 },
    @{ Name = "finished_report_dark.png"; Url = "http://localhost:3000/app?demo=finished&theme=dark"; Width = 1440; Height = 1000; Delay = 5000 },
    @{ Name = "mobile_view.png"; Url = "http://localhost:3000/app?demo=finished&theme=light"; Width = 390; Height = 844; Delay = 5000 },
    @{ Name = "mobile_view_dark.png"; Url = "http://localhost:3000/app?demo=finished&theme=dark"; Width = 390; Height = 844; Delay = 5000 }
)

foreach ($s in $shots) {
    $targetPath = Join-Path $outDir $s.Name
    if (Test-Path $targetPath) {
        Remove-Item -Force $targetPath -ErrorAction SilentlyContinue
    }
    
    $tempProfile = Join-Path $env:TEMP ("edge_shot_" + [System.Guid]::NewGuid().ToString())
    Write-Host "Capturing $($s.Name) from $($s.Url)..."
    
    $proc = Start-Process -FilePath $edge -ArgumentList @(
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--window-size=$($s.Width),$($s.Height)",
        "--screenshot=$targetPath",
        "--user-data-dir=$tempProfile",
        "--virtual-time-budget=$($s.Delay)",
        "--run-all-compositor-stages-before-draw",
        $s.Url
    ) -Wait -PassThru -NoNewWindow
    
    Remove-Item -Recurse -Force $tempProfile -ErrorAction SilentlyContinue
    
    if (Test-Path $targetPath) {
        $size = (Get-Item $targetPath).Length
        Write-Host "Captured $($s.Name): $size bytes"
    } else {
        Write-Warning "Failed to capture $($s.Name)"
    }
}
Write-Host "Done capturing all screenshots."
