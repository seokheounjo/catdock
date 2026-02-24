import { SetupWizard } from '../components/dashboard/SetupWizard'

export function SetupPage() {
  const handleComplete = () => {
    // 셋업 완료 후 창 닫기
    window.api.window.close()
  }

  return <SetupWizard onComplete={handleComplete} />
}
