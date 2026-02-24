#!/usr/bin/env node
/**
 * 실시간 Hello World 프로젝트 감시 시스템
 * 작성자: 김감시 (상태감시원)
 * 생성일: 2026-02-24
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 감시 설정
const MONITOR_CONFIG = {
    checkInterval: 3 * 60 * 1000, // 3분
    reportInterval: 10 * 60 * 1000, // 10분
    targetFile: path.join(process.cwd(), 'test-output', 'hello.js'),
    projectRoot: process.cwd()
};

// 상태 추적
let monitorState = {
    lastFileHash: null,
    lastFileSize: null,
    lastCheckTime: null,
    changeCount: 0,
    reportCount: 0,
    errors: []
};

// 파일 해시 계산
function calculateFileHash(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const crypto = require('crypto');
        return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
        return null;
    }
}

// 파일 상태 확인
function checkFileStatus() {
    const result = {
        timestamp: new Date().toISOString(),
        exists: false,
        size: 0,
        hash: null,
        executable: false,
        changes: false
    };

    try {
        if (fs.existsSync(MONITOR_CONFIG.targetFile)) {
            result.exists = true;
            const stats = fs.statSync(MONITOR_CONFIG.targetFile);
            result.size = stats.size;
            result.hash = calculateFileHash(MONITOR_CONFIG.targetFile);

            // 변경 사항 감지
            if (monitorState.lastFileHash && monitorState.lastFileHash !== result.hash) {
                result.changes = true;
                monitorState.changeCount++;
            }

            monitorState.lastFileHash = result.hash;
            monitorState.lastFileSize = result.size;
        }
    } catch (error) {
        monitorState.errors.push({
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }

    return result;
}

// 프로세스 상태 확인
function checkProcessStatus() {
    return new Promise((resolve) => {
        const result = {
            nodeProcesses: [],
            electronProcesses: [],
            totalProcesses: 0
        };

        const ps = spawn('ps', ['aux']);
        let output = '';

        ps.stdout.on('data', (data) => {
            output += data.toString();
        });

        ps.on('close', () => {
            const lines = output.split('\n');

            lines.forEach(line => {
                if (line.includes('node') && !line.includes('grep')) {
                    result.nodeProcesses.push(line.trim());
                }
                if (line.includes('electron') && !line.includes('grep')) {
                    result.electronProcesses.push(line.trim());
                }
            });

            result.totalProcesses = result.nodeProcesses.length + result.electronProcesses.length;
            resolve(result);
        });
    });
}

// hello.js 실행 테스트
function testHelloExecution() {
    return new Promise((resolve) => {
        const result = {
            success: false,
            output: '',
            error: null,
            executionTime: 0
        };

        const startTime = Date.now();
        const testProcess = spawn(process.execPath, [MONITOR_CONFIG.targetFile], {
            cwd: path.dirname(MONITOR_CONFIG.targetFile)
        });

        let stdout = '';
        let stderr = '';

        testProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        testProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        testProcess.on('close', (code) => {
            result.executionTime = Date.now() - startTime;
            result.output = stdout.trim();
            result.error = stderr.trim() || null;
            result.success = code === 0 && result.output === 'Hello World';
            resolve(result);
        });

        // 5초 타임아웃
        setTimeout(() => {
            testProcess.kill();
            result.error = 'Execution timeout (5s)';
            resolve(result);
        }, 5000);
    });
}

// 상태 보고서 생성
async function generateStatusReport() {
    const fileStatus = checkFileStatus();
    const processStatus = await checkProcessStatus();
    const executionTest = await testHelloExecution();

    const report = {
        reportId: `monitor_${Date.now()}`,
        timestamp: new Date().toISOString(),
        monitorInfo: {
            reportNumber: ++monitorState.reportCount,
            totalChanges: monitorState.changeCount,
            errorsCount: monitorState.errors.length
        },
        fileStatus: fileStatus,
        processStatus: processStatus,
        executionTest: executionTest,
        systemHealth: {
            status: fileStatus.exists && executionTest.success ? 'HEALTHY' : 'WARNING',
            issues: []
        }
    };

    // 이슈 감지
    if (!fileStatus.exists) {
        report.systemHealth.issues.push('TARGET_FILE_MISSING');
    }
    if (!executionTest.success) {
        report.systemHealth.issues.push('EXECUTION_FAILED');
    }
    if (monitorState.errors.length > 0) {
        report.systemHealth.issues.push('SYSTEM_ERRORS');
    }

    if (report.systemHealth.issues.length > 0) {
        report.systemHealth.status = 'CRITICAL';
    }

    return report;
}

// 즉시 알림 출력
function printAlert(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'CRITICAL' ? '🚨' : type === 'WARNING' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
}

// 정기 보고 출력
function printStatusReport(report) {
    console.log('\n📊 ==== 정기 상태 보고 ====');
    console.log(`🕐 시간: ${report.timestamp}`);
    console.log(`📋 보고서 번호: ${report.monitorInfo.reportNumber}`);
    console.log(`📁 파일 상태: ${report.fileStatus.exists ? '✅ 존재' : '❌ 없음'}`);

    if (report.fileStatus.exists) {
        console.log(`📏 파일 크기: ${report.fileStatus.size} bytes`);
        console.log(`🔒 파일 해시: ${report.fileStatus.hash}`);
        console.log(`🔄 변경 사항: ${report.fileStatus.changes ? '감지됨' : '없음'}`);
    }

    console.log(`🎯 실행 테스트: ${report.executionTest.success ? '✅ 성공' : '❌ 실패'}`);
    if (report.executionTest.success) {
        console.log(`📤 출력: "${report.executionTest.output}"`);
        console.log(`⏱️ 실행시간: ${report.executionTest.executionTime}ms`);
    }

    console.log(`🖥️ Node.js 프로세스: ${report.processStatus.nodeProcesses.length}개`);
    console.log(`⚡ Electron 프로세스: ${report.processStatus.electronProcesses.length}개`);

    console.log(`🌡️ 시스템 상태: ${report.systemHealth.status}`);
    if (report.systemHealth.issues.length > 0) {
        console.log(`⚠️ 이슈: ${report.systemHealth.issues.join(', ')}`);
    }

    console.log(`📈 총 변경횟수: ${report.monitorInfo.totalChanges}`);
    console.log('==========================\n');
}

// 메인 감시 루프
async function startMonitoring() {
    printAlert('Hello World 프로젝트 실시간 감시 시스템 시작', 'INFO');
    printAlert(`감시 대상: ${MONITOR_CONFIG.targetFile}`, 'INFO');
    printAlert(`점검 간격: ${MONITOR_CONFIG.checkInterval / 1000}초`, 'INFO');
    printAlert(`보고 간격: ${MONITOR_CONFIG.reportInterval / 1000}초`, 'INFO');

    // 초기 상태 확인
    const initialReport = await generateStatusReport();
    printStatusReport(initialReport);

    // 마지막 정기 보고 시간 추적
    let lastReportTime = Date.now();

    // 감시 루프 시작
    setInterval(async () => {
        try {
            const currentTime = Date.now();
            monitorState.lastCheckTime = new Date().toISOString();

            // 파일 상태 확인
            const fileStatus = checkFileStatus();

            // 변경 사항 즉시 알림
            if (fileStatus.changes) {
                printAlert(`파일 변경 감지! 해시: ${fileStatus.hash}`, 'WARNING');
            }

            // 정기 보고 시간 확인
            if (currentTime - lastReportTime >= MONITOR_CONFIG.reportInterval) {
                const report = await generateStatusReport();
                printStatusReport(report);
                lastReportTime = currentTime;
            }

        } catch (error) {
            printAlert(`감시 중 오류 발생: ${error.message}`, 'CRITICAL');
            monitorState.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    }, MONITOR_CONFIG.checkInterval);

    // Graceful shutdown
    process.on('SIGINT', () => {
        printAlert('감시 시스템 종료 중...', 'INFO');
        process.exit(0);
    });
}

// 실행
if (require.main === module) {
    startMonitoring().catch(error => {
        console.error('감시 시스템 시작 실패:', error);
        process.exit(1);
    });
}

module.exports = {
    startMonitoring,
    generateStatusReport,
    checkFileStatus,
    checkProcessStatus,
    testHelloExecution
};