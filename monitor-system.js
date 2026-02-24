#!/usr/bin/env node
/**
 * 상태감시원 김상태 - 지속 모니터링 시스템
 * Virtual Company 프로젝트 실시간 감시
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ProjectMonitor {
  constructor() {
    this.projectRoot = '/c/Users/jsh/virtual-company';
    this.targetFile = 'test-output/hello.js';
    this.reportFile = 'monitoring-report.md';
    this.startTime = new Date();
    this.checkCount = 0;
  }

  /**
   * 현재 시각 포맷팅
   */
  getCurrentTime() {
    return new Date().toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * 타겟 파일 존재 여부 확인
   */
  checkTargetFile() {
    const targetPath = path.join(this.projectRoot, this.targetFile);
    const rootHelloPath = path.join(this.projectRoot, 'hello.js');

    const targetExists = fs.existsSync(targetPath);
    const rootExists = fs.existsSync(rootHelloPath);

    return {
      targetExists,
      rootExists,
      targetPath,
      rootHelloPath
    };
  }

  /**
   * test-output 디렉토리 구조 분석
   */
  analyzeTestOutput() {
    const testOutputPath = path.join(this.projectRoot, 'test-output');

    try {
      const items = fs.readdirSync(testOutputPath, { withFileTypes: true });
      return {
        exists: true,
        contents: items.map(item => ({
          name: item.name,
          type: item.isDirectory() ? 'directory' : 'file',
          size: item.isFile() ? fs.statSync(path.join(testOutputPath, item.name)).size : null
        }))
      };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }

  /**
   * 실행 중인 프로세스 확인
   */
  checkProcesses() {
    try {
      const processes = execSync('ps aux | grep -E "(node|electron|claude)" | grep -v grep', { encoding: 'utf8' });
      const processLines = processes.split('\n').filter(line => line.trim());

      return {
        count: processLines.length,
        processes: processLines.map(line => {
          const parts = line.trim().split(/\s+/);
          return {
            pid: parts[0],
            command: parts.slice(10).join(' ')
          };
        })
      };
    } catch (error) {
      return { count: 0, error: error.message };
    }
  }

  /**
   * 종합 상태 점검
   */
  performCheck() {
    this.checkCount++;
    const timestamp = this.getCurrentTime();

    console.log(`\\n🔍 [${timestamp}] 감시 #${this.checkCount} 수행 중...`);

    const fileStatus = this.checkTargetFile();
    const outputAnalysis = this.analyzeTestOutput();
    const processStatus = this.checkProcesses();

    // 상태 변화 감지
    const issues = [];
    const updates = [];

    if (!fileStatus.targetExists && fileStatus.rootExists) {
      issues.push('❌ hello.js 파일이 여전히 잘못된 위치(루트)에 있음');
    } else if (fileStatus.targetExists) {
      updates.push('✅ hello.js 파일이 올바른 위치(test-output/)에 생성됨');
    }

    if (!fileStatus.targetExists && !fileStatus.rootExists) {
      issues.push('⚠️  hello.js 파일을 찾을 수 없음 (삭제됨?)');
    }

    // 콘솔 출력
    console.log('📊 현재 상태:');
    console.log(`   • 타겟 파일: ${fileStatus.targetExists ? '✅ 존재' : '❌ 없음'}`);
    console.log(`   • 루트 파일: ${fileStatus.rootExists ? '⚠️ 잘못된 위치' : '✅ 정리됨'}`);
    console.log(`   • 활성 프로세스: ${processStatus.count}개`);
    console.log(`   • test-output 항목: ${outputAnalysis.contents?.length || 0}개`);

    if (issues.length > 0) {
      console.log('\\n🚨 발견된 이슈:');
      issues.forEach(issue => console.log(`   ${issue}`));
    }

    if (updates.length > 0) {
      console.log('\\n🎉 긍정적 변화:');
      updates.forEach(update => console.log(`   ${update}`));
    }

    return {
      timestamp,
      checkNumber: this.checkCount,
      fileStatus,
      outputAnalysis,
      processStatus,
      issues,
      updates
    };
  }

  /**
   * 5분 간격 지속 감시 시작
   */
  startContinuousMonitoring() {
    console.log('🚀 상태감시원 김상태 - 지속 모니터링 시작');
    console.log(`   프로젝트: ${this.projectRoot}`);
    console.log(`   감시 대상: ${this.targetFile}`);
    console.log(`   감시 간격: 5분`);
    console.log(`   시작 시각: ${this.getCurrentTime()}`);

    // 즉시 첫 번째 점검 수행
    this.performCheck();

    // 5분마다 점검 수행 (300,000ms)
    setInterval(() => {
      this.performCheck();
    }, 5 * 60 * 1000);

    console.log('\\n🔄 지속 감시 모드 활성화됨 (Ctrl+C로 중단)');
  }
}

// 모니터링 시스템 시작
if (require.main === module) {
  const monitor = new ProjectMonitor();
  monitor.startContinuousMonitoring();

  // 우아한 종료 처리
  process.on('SIGINT', () => {
    console.log('\\n\\n📋 감시 종료 요청됨');
    console.log(`총 ${monitor.checkCount}회 점검 수행`);
    console.log('상태감시원 김상태 - 감시 업무 완료');
    process.exit(0);
  });
}

module.exports = ProjectMonitor;