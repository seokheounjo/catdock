const ko = {
  // 대시보드
  dashboard: {
    title: 'Virtual Company Dashboard',
    teamOverview: '팀 개요',
    activityFeed: '활동 피드',
    taskBoard: '태스크 보드',
    settings: '설정',
    mcpServers: 'MCP 서버',
    cliInstalled: 'Claude CLI v{version}',
    cliNotInstalled: 'Claude CLI 미설치',
    cliNotInstalledDesc: '에이전트와 대화하려면 Claude Code CLI가 필요합니다.',
    cliInstallHint: '터미널에서 npm install -g @anthropic-ai/claude-code 를 실행하세요.'
  },

  // 태스크 보드
  taskBoard: {
    title: '태스크 보드',
    noTasks: '위임된 작업이 없습니다.',
    newTask: '새 태스크',
    columns: {
      pending: '대기 중',
      assigned: '배정됨',
      'in-progress': '진행 중',
      completed: '완료',
      failed: '실패',
      cancelled: '취소'
    },
    filter: {
      search: '검색...',
      allAgents: '모든 에이전트',
      allPriorities: '모든 우선순위'
    },
    priority: {
      urgent: '긴급',
      high: '높음',
      medium: '보통',
      low: '낮음'
    },
    actions: {
      start: '시작',
      complete: '완료',
      fail: '실패',
      cancel: '취소',
      reopen: '재오픈',
      assign: '배정',
      delete: '삭제'
    },
    overdue: '기한 초과',
    dueDate: '마감일',
    user: 'User',
    unknown: 'Unknown'
  },

  // 태스크 생성 폼
  taskCreate: {
    title: '새 태스크 생성',
    taskTitle: '제목',
    taskTitlePlaceholder: '태스크 제목 입력...',
    description: '설명',
    descriptionPlaceholder: '태스크 설명 입력...',
    assignee: '담당 에이전트',
    selectAgent: '에이전트 선택...',
    priority: '우선순위',
    dueDate: '마감일',
    tags: '태그',
    tagsPlaceholder: '태그 (쉼표로 구분)',
    cancel: '취소',
    create: '생성'
  },

  // 태스크 상세 모달
  taskDetail: {
    title: '태스크 상세',
    status: '상태',
    priority: '우선순위',
    assignee: '담당자',
    creator: '생성자',
    createdAt: '생성일',
    dueDate: '마감일',
    completedAt: '완료일',
    tags: '태그',
    result: '결과',
    resultPlaceholder: '결과 입력...',
    save: '저장',
    close: '닫기',
    delete: '삭제',
    noDueDate: '없음',
    noTags: '없음'
  },

  // 설정
  settings: {
    title: '설정',
    groupChat: '그룹 채팅',
    dashboard: '대시보드',
    lightMode: '라이트 모드',
    darkMode: '다크 모드',
    dockSize: '독 크기',
    quit: '종료',
    cliUpdate: 'CLI 업데이트 (v{version})',
    appUpdateChecking: '앱 업데이트 확인 중...',
    appUpdateAvailable: '새 버전 v{version} 사용 가능',
    appUpdateDownloading: '다운로드 중... {percent}%',
    appUpdateReady: 'v{version} 설치 준비 완료 — 재시작',
    appUpdateLatest: '최신 버전 사용 중',
    appUpdateError: '업데이트 확인 실패',
    appUpdateCheck: '업데이트 확인',
    appUpdateDownload: '다운로드',
    appUpdateInstall: '재시작하여 설치',
    groupChatMembers: '명',
    noGroupChats: '그룹 채팅이 없습니다',
    newGroupChat: '새 방 만들기',
    // 글로벌 설정
    globalSettings: '글로벌 설정',
    defaultModel: '기본 모델',
    defaultPermissionMode: '기본 퍼미션 모드',
    defaultMaxTurns: '기본 최대 턴',
    defaultWorkingDir: '기본 작업 디렉토리',
    agentSpawnLimit: '에이전트 스폰 제한',
    browse: '찾아보기',
    // 전사 규칙
    companyRules: '전사 공통 규칙',
    companyRulesPlaceholder: '모든 에이전트의 시스템 프롬프트에 추가될 공통 규칙...',
    companyRulesDesc: '이 규칙은 모든 에이전트의 시스템 프롬프트 앞에 삽입됩니다.',
    // 언어
    language: '언어',
    uiLanguage: 'UI 언어',
    agentLanguage: '에이전트 응답 언어',
    agentLanguageDesc: '에이전트가 응답할 언어를 지정합니다.',
    langAuto: '자동 (시스템)',
    langKo: '한국어',
    langEn: 'English',
    langJa: '日本語',
    langZh: '中文',
    // 역할 템플릿
    roleTemplates: '역할 템플릿',
    builtinTemplates: '기본 제공',
    customTemplates: '커스텀',
    addTemplate: '새 템플릿 추가',
    editTemplate: '편집',
    deleteTemplate: '삭제',
    templateName: '템플릿 이름',
    leaderTemplate: '리더 전용',
    memberTemplate: '멤버용',
    // 작업 디렉토리 플레이스홀더
    workingDirPlaceholder: '기본 프로젝트 폴더 선택...',
    defaultCliProvider: '기본 CLI 프로바이더'
  },

  // 에이전트 에디터
  agentEditor: {
    newAgent: '새 에이전트',
    editAgent: '에이전트 편집',
    identity: 'Identity',
    modelPerms: 'Model & Perms',
    systemPrompt: 'System Prompt',
    mcp: 'MCP',
    advanced: 'Advanced',
    actions: 'Actions',
    name: '이름',
    role: '역할',
    roleTemplate: '역할 템플릿',
    selectTemplate: '템플릿 선택...',
    group: '그룹 (선택)',
    hierarchyRole: '계층 역할',
    member: 'Member (팀원)',
    leader: 'Leader (팀장)',
    director: 'Director (총괄)',
    reportsTo: 'Reports To (선택)',
    none: '— 없음 —',
    model: '모델',
    customModelId: 'Custom Model ID',
    permissionMode: '퍼미션 모드',
    maxTurns: '최대 턴',
    workingDir: '작업 디렉토리',
    cliFlags: 'CLI 플래그',
    cancel: '취소',
    save: '저장',
    create: '생성',
    randomize: '랜덤 생성',
    selectTemplateAutoFill: '템플릿을 선택하여 자동 채우기...',
    maxTurnsLabel: '최대 턴: {count}',
    agentMcpServers: '에이전트 MCP 서버',
    addMcp: '+ 추가',
    noMcpServers: 'MCP 서버가 설정되지 않았습니다',
    removeMcp: '삭제',
    serverName: '서버 이름',
    commandPlaceholder: '명령어 (예: npx)',
    argsPlaceholder: 'Args (쉼표 구분)',
    workingDirPlaceholder: '프로젝트 폴더 선택...',
    browse: '찾아보기',
    jsonSchemaLabel: 'JSON Schema (파일 경로)',
    optional: '(선택 사항)',
    additionalArgs: '추가 CLI 인수',
    duplicate: '에이전트 복제',
    exportConfig: '설정 내보내기 (클립보드 복사)',
    importJson: 'JSON에서 에이전트 가져오기',
    pasteJson: '에이전트 JSON 설정을 붙여넣기:',
    invalidJson: '잘못된 JSON',
    templateAutoFillHint:
      '템플릿을 선택하면 역할, 시스템 프롬프트, 모델, 권한, 최대 턴이 자동으로 설정됩니다.',
    templateApplied: "'{name}' 적용됨 — 모델: {model}, 권한: {perm}, 턴: {turns}",
    rolePlaceholder: '역할명 (예: Frontend Developer)',
    cliProvider: 'CLI 프로바이더',
    cliInstalled: '설치됨',
    cliNotInstalled: '미설치',
    notSupportedByProvider: '이 프로바이더에서 미지원'
  },

  // MCP 서버 편집기
  mcp: {
    loading: 'MCP 서버 로딩 중...',
    title: 'MCP 서버 (글로벌)',
    addServer: '+ 서버 추가',
    save: '저장',
    noServers: '글로벌 MCP 서버가 없습니다. 서버를 추가하세요.',
    remove: '삭제',
    newServer: '새 서버',
    name: '이름',
    command: '명령어',
    args: 'Args (쉼표 구분)',
    workingDir: '작업 디렉토리',
    optional: '(선택 사항)'
  },

  // 1:1 채팅
  chat: {
    clearHistory: '채팅 기록 지우기',
    minimize: '최소화',
    closeWindow: '창 닫기',
    statusWorking: '작업 중...',
    statusError: '오류',
    statusOnline: '온라인',
    removeAttachment: '첨부 파일 제거',
    attachFile: '파일 첨부',
    attachHint: '파일 첨부 (드래그 앤 드롭도 가능)',
    placeholderStreaming: '응답 생성 중...',
    placeholder: '메시지를 입력하세요...',
    ariaInput: '채팅 메시지 입력',
    ariaStreaming: '에이전트가 응답을 생성하고 있습니다',
    ariaAbort: '응답 생성 중단하기',
    ariaSend: '메시지 전송하기',
    ariaEmptySend: '메시지를 입력한 후 전송하세요',
    stop: '중단',
    send: '전송',
    startConversation: '대화를 시작하세요...',
    loading: '로딩 중...',
    systemAlert: '시스템 알림: {content}',
    userMessage: '사용자',
    agentMessage: '에이전트',
    sentAt: '{time}에 전송됨',
    filePrefix: '파일'
  },

  // 그룹 채팅
  groupChat: {
    statusChaining: '체이닝 중...',
    statusPaused: '일시정지',
    statusWaitingAgent: '에이전트 작업 중...',
    statusIdle: '대기',
    autoMode: '자동 체인 모드',
    manualMode: '수동 모드',
    auto: '자동',
    manual: '수동',
    clearChat: '채팅 초기화',
    deleteConversation: '대화 삭제',
    minimize: '최소화',
    close: '닫기',
    pause: '일시정지',
    resume: '재개',
    stop: '중단',
    sendMessage: '전송',
    typePlaceholder: '메시지를 입력하세요...',
    triggerManually: '에이전트 수동 트리거',
    startGroupConversation: '그룹 대화를 시작하세요...',
    newGroupChat: '새 그룹 채팅',
    roomName: '방 이름',
    roomNamePlaceholder: '예: 아키텍처 논의',
    participants: '참여자',
    participantsCount: '{count}명 선택됨, 최소 2명',
    maxRounds: '체인당 최대 라운드',
    creating: '생성 중...',
    createGroupChat: '그룹 채팅 생성',
    loading: '로딩 중...'
  },

  // 활동 피드
  activity: {
    title: '활동 피드',
    clear: '초기화',
    noActivity: '아직 활동이 없습니다.'
  },

  // 조직도
  orgChart: {
    noAgents: '에이전트가 없습니다.',
    temporaryAgents: '임시 에이전트'
  },

  // 에이전트 카드
  agentCard: {
    edit: '편집',
    delete: '삭제',
    teamLeader: '팀 리더',
    teamDirector: '총괄',
    temporary: '임시',
    model: '모델',
    cost: '비용',
    status: '상태',
    process: '프로세스'
  },

  // 퍼미션 다이얼로그
  permission: {
    title: '퍼미션 요청',
    seconds: '{count}초',
    tool: '도구',
    input: '입력',
    noInput: '(입력 없음)',
    allow: '허용',
    deny: '거부'
  },

  // 셋업 위자드
  setup: {
    appTitle: 'Virtual Company',
    appDesc: 'AI 에이전트 팀으로 구성된 가상 회사 시뮬레이터',
    welcomeTitle: '환영합니다!',
    welcomeDesc:
      'Virtual Company는 각각 전문 분야를 가진 AI 에이전트들이 팀으로 협업하는 시뮬레이터입니다. 각 에이전트는 독립적인 Claude Code CLI 프로세스로 동작하며, 실제 코드를 읽고 수정할 수 있습니다.',
    step1Title: 'Claude Code CLI 연동',
    step1Desc: '에이전트 실행에 필요한 CLI 설치 확인',
    step2Title: '작업 디렉토리 설정',
    step2Desc: '에이전트가 작업할 기본 폴더 지정',
    step3Title: '바로 시작!',
    step3Desc: '총괄(Director)이 작업에 맞게 팀을 자동 편성합니다',
    startSetup: '시작하기',
    cliTitle: 'Claude Code CLI',
    cliDesc: '에이전트와 대화하려면 Claude Code CLI가 필요합니다.',
    checking: '확인 중...',
    cliInstalled: 'Claude Code CLI v{version} 설치됨',
    cliNotInstalled: 'Claude Code CLI가 설치되지 않았습니다',
    nodeDetected: 'Node.js {version} 감지됨',
    installing: '설치 중...',
    autoInstall: '자동으로 설치하기',
    nodeNotInstalled: 'Node.js가 설치되지 않았습니다. 먼저 Node.js를 설치해주세요.',
    prev: '이전',
    next: '다음',
    skipCli: 'CLI 없이 계속',
    workingDirTitle: '작업 디렉토리',
    workingDirDesc:
      '에이전트가 기본으로 작업할 폴더를 선택하세요. 에이전트별로 나중에 개별 설정할 수 있습니다.',
    clickToChange: '클릭하여 변경',
    clickToSelect: '클릭하여 폴더 선택',
    dirExample: '예: C:\\Users\\{username}\\Projects',
    defaultDirNote: '선택하지 않으면 앱 실행 디렉토리가 기본값으로 사용됩니다.',
    completeTitle: '준비 완료!',
    completeDesc: '모든 설정이 완료되었습니다. 이제 에이전트 팀과 함께 작업할 수 있습니다.',
    cliSummary: 'Claude CLI',
    notInstalledNote: '미설치 (나중에 설치 가능)',
    workingDirSummary: '작업 디렉토리',
    defaultDir: '기본값 사용',
    agentTeam: '총괄 에이전트 준비됨',
    howToStart: '시작 방법:',
    howToStartDesc:
      '하단 독에서 에이전트 아바타를 클릭하면 대화창이 열립니다. 톱니바퀴 아이콘으로 대시보드를, + 아이콘으로 에이전트 추가/그룹 채팅을 만들 수 있습니다.',
    letsStart: '시작하기',
    cliInstallingMsg: 'Claude Code CLI 설치 중...'
  },

  // 테마
  theme: {
    light: '라이트',
    dark: '다크',
    system: '시스템',
    currentTheme: '현재: {theme} 테마',
    switchToLight: '라이트 모드로',
    switchToDark: '다크 모드로'
  },

  // 독 (하단 바)
  dock: {
    addAgent: '새 에이전트 추가',
    settings: '설정',
    agentMenu: '에이전트 메뉴',
    chat: '채팅하기',
    edit: '편집하기',
    setLeader: '리더로 설정',
    setDirector: '총괄로 설정',
    setMember: '팀원으로 변경',
    delete: '삭제하기',
    statusIdle: '대기 중',
    statusWorking: '작업 중',
    statusError: '오류 상태',
    statusUnknown: '알 수 없음',
    chatWith: '{name} 에이전트와 채팅하기',
    statusLabel: '상태',
    catWorking: '작업 중인 낚시 고양이',
    catIdle: '대기 중인 낚시 고양이',
    catError: '오류 상태의 낚시 고양이',
    catRecovering: '팀장이 복구 중인 낚시 고양이',
    catDefault: '낚시 고양이',
    statusRecovering: '팀장이 해결 중...',
    collapse: '접기',
    expand: '펼치기',
    collapsedCount: '{count}명 숨김'
  },

  common: {
    loading: '로딩 중...',
    error: '오류',
    confirm: '확인',
    cancel: '취소',
    save: '저장',
    delete: '삭제',
    close: '닫기',
    search: '검색'
  }
}

export default ko
export type LocaleMessages = typeof ko
