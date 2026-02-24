#!/usr/bin/env node
/**
 * 간단한 Hello World 프로젝트 감시 시스템
 * 작성자: 김감시 (상태감시원)
 * 생성일: 2026-02-24
 */

const fs = require('fs');
const path = require('path');

// 감시 설정
const MONITOR_CONFIG = {
    checkInterval: 3 * 60 * 1000, // 3분
    reportInterval: 10 * 60 * 1000, // 10분
    targetFile: './test-output/hello.js',
    projectRoot: process.cwd()
};

// 상태 추적
let monitorState = {
    lastFileHash: null,
    lastFileSize: null,
    lastCheckTime: null,
    changeCount: 0,
    reportCount: 0,
    errors: [],
    startTime: new Date()
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
        changes: false,
        content: null
    };

    try {
        if (fs.existsSync(MONITOR_CONFIG.targetFile)) {
            result.exists = true;
            const stats = fs.statSync(MONITOR_CONFIG.targetFile);
            result.size = stats.size;
            result.hash = calculateFileHash(MONITOR_CONFIG.targetFile);
            result.content = fs.readFileSync(MONITOR_CONFIG.targetFile, 'utf8').trim();

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

// 간단한 hello.js 검증
function validateHelloJS(content) {
    if (!content) return false;

    // console.log 포함되어 있는지 확인
    const hasConsoleLog = content.includes('console.log');
    const hasHelloWorld = content.toLowerCase().includes('hello world');

    return hasConsoleLog && hasHelloWorld;
}

// 즉시 알림 출력
function printAlert(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'CRITICAL' ? '🚨' : type === 'WARNING' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
}

// 정기 보고서 생성 및 출력
function generateAndPrintStatusReport() {
    const fileStatus = checkFileStatus();
    const currentTime = new Date();
    const uptime = Math.floor((currentTime - monitorState.startTime) / 1000);

    console.log('\n📊 ==== 정기 상태 보고 ====');
    console.log(`🕐 보고 시간: ${currentTime.toISOString()}`);
    console.log(`📋 보고서 번호: ${++monitorState.reportCount}`);
    console.log(`⏱️ 모니터링 가동시간: ${uptime}초`);
    console.log(`📁 타겟 파일: ${MONITOR_CONFIG.targetFile}`);
    console.log(`📁 파일 존재 여부: ${fileStatus.exists ? '✅ 존재' : '❌ 없음'}`);

    if (fileStatus.exists) {
        console.log(`📏 파일 크기: ${fileStatus.size} bytes`);
        console.log(`🔒 파일 해시: ${fileStatus.hash?.substring(0, 8)}...`);
        console.log(`🔄 변경 사항: ${fileStatus.changes ? '감지됨' : '없음'}`);
        console.log(`✅ Hello World 검증: ${validateHelloJS(fileStatus.content) ? '통과' : '실패'}`);

        if (fileStatus.content) {
            console.log(`📄 파일 내용 (첫 100자):`);
            console.log(`   "${fileStatus.content.substring(0, 100)}${fileStatus.content.length > 100 ? '...' : ''}"`);
        }
    }

    console.log(`📈 총 변경횟수: ${monitorState.changeCount}`);
    console.log(`🚨 오류 횟수: ${monitorState.errors.length}`);

    // 최근 오류 표시
    if (monitorState.errors.length > 0) {
        const recentErrors = monitorState.errors.slice(-3);
        console.log(`⚠️ 최근 오류:`);
        recentErrors.forEach(err => {
            console.log(`   [${err.timestamp}] ${err.error}`);
        });
    }

    const systemStatus = fileStatus.exists && validateHelloJS(fileStatus.content) ? '🟢 정상' : '🔴 이상';
    console.log(`🌡️ 시스템 상태: ${systemStatus}`);
    console.log('==========================\n');
}

// 메인 감시 루프
async function startMonitoring() {
    printAlert('Hello World 프로젝트 간단 감시 시스템 시작', 'INFO');
    printAlert(`감시 대상: ${path.resolve(MONITOR_CONFIG.targetFile)}`, 'INFO');
    printAlert(`점검 간격: ${MONITOR_CONFIG.checkInterval / 1000}초`, 'INFO');
    printAlert(`보고 간격: ${MONITOR_CONFIG.reportInterval / 1000}초`, 'INFO');

    // 초기 상태 확인
    generateAndPrintStatusReport();

    // 마지막 정기 보고 시간 추적
    let lastReportTime = Date.now();

    // 감시 루프 시작
    const intervalId = setInterval(() => {
        try {
            const currentTime = Date.now();
            monitorState.lastCheckTime = new Date().toISOString();

            // 파일 상태 확인
            const fileStatus = checkFileStatus();

            // 변경 사항 즉시 알림
            if (fileStatus.changes) {
                printAlert(`파일 변경 감지! 새 해시: ${fileStatus.hash?.substring(0, 8)}...`, 'WARNING');
                printAlert(`파일 크기: ${fileStatus.size} bytes`, 'INFO');
            }

            // 파일이 사라진 경우 즉시 알림
            if (!fileStatus.exists) {
                printAlert(`타겟 파일이 존재하지 않습니다: ${MONITOR_CONFIG.targetFile}`, 'CRITICAL');
            }

            // 정기 보고 시간 확인
            if (currentTime - lastReportTime >= MONITOR_CONFIG.reportInterval) {
                generateAndPrintStatusReport();
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
        clearInterval(intervalId);

        // 최종 보고서
        console.log('\n📊 ==== 최종 상태 보고 ====');
        console.log(`⏱️ 총 가동시간: ${Math.floor((Date.now() - monitorState.startTime) / 1000)}초`);
        console.log(`📈 총 변경횟수: ${monitorState.changeCount}`);
        console.log(`📋 총 보고서: ${monitorState.reportCount}`);
        console.log('감시 시스템이 정상적으로 종료되었습니다.');

        process.exit(0);
    });
}

// 즉시 실행
if (require.main === module) {
    startMonitoring().catch(error => {
        console.error('감시 시스템 시작 실패:', error);
        process.exit(1);
    });
}

module.exports = {
    startMonitoring,
    checkFileStatus,
    validateHelloJS
};