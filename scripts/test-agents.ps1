# Multi-Agent System Test Script
# Run this script to test the entire agent system

param(
    [string]$TestType = "full",
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Career Prep Multi-Agent System Tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Next.js server is running
Write-Host "Checking if Next.js server is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/test/agents" -Method GET -TimeoutSec 5
    Write-Host "✓ Next.js server is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Next.js server is not running!" -ForegroundColor Red
    Write-Host "  Please run 'npm run dev' first" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Running $TestType tests..." -ForegroundColor Yellow
Write-Host ""

# Run the tests
try {
    $body = @{
        test_type = $TestType
    } | ConvertTo-Json

    $result = Invoke-RestMethod -Uri "$BaseUrl/api/test/agents" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 120

    # Display results
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "              TEST RESULTS              " -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "Test Type: $($result.test_type)" -ForegroundColor White
    Write-Host "Duration: $($result.duration_ms)ms" -ForegroundColor White
    Write-Host ""
    
    # Summary
    $passedColor = if ($result.passed -gt 0) { "Green" } else { "Gray" }
    $failedColor = if ($result.failed -gt 0) { "Red" } else { "Gray" }
    $skippedColor = if ($result.skipped -gt 0) { "Yellow" } else { "Gray" }
    
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "  ✓ Passed:  $($result.passed)" -ForegroundColor $passedColor
    Write-Host "  ✗ Failed:  $($result.failed)" -ForegroundColor $failedColor
    Write-Host "  ○ Skipped: $($result.skipped)" -ForegroundColor $skippedColor
    Write-Host ""
    
    # Detailed results
    Write-Host "Detailed Results:" -ForegroundColor Cyan
    Write-Host "----------------------------------------"
    
    foreach ($test in $result.results) {
        $icon = switch ($test.status) {
            "passed" { "✓"; $color = "Green" }
            "failed" { "✗"; $color = "Red" }
            "skipped" { "○"; $color = "Yellow" }
            default { "?"; $color = "Gray" }
        }
        
        Write-Host "  $icon $($test.test)" -ForegroundColor $color
        
        if ($test.status -eq "failed" -and $test.error) {
            Write-Host "    Error: $($test.error)" -ForegroundColor Red
        }
        
        if ($test.details -and $test.status -ne "skipped") {
            $details = $test.details | ConvertTo-Json -Compress
            if ($details.Length -lt 100) {
                Write-Host "    Details: $details" -ForegroundColor Gray
            }
        }
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    
    if ($result.failed -gt 0) {
        Write-Host "  TESTS FAILED! Check errors above." -ForegroundColor Red
        exit 1
    } else {
        Write-Host "  ALL TESTS PASSED!" -ForegroundColor Green
        exit 0
    }
    
} catch {
    Write-Host "Error running tests: $_" -ForegroundColor Red
    exit 1
}
