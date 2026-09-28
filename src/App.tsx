import { AppProvider, useApp } from './ui/state';
import { HomeScreen } from './ui/screens/Home';
import { PlayScreen } from './ui/screens/Play';
import { RecordsScreen } from './ui/screens/Records';
import { ResultScreen } from './ui/screens/Result';
import { SettingsScreen } from './ui/screens/Settings';
import { SetupScreen } from './ui/screens/Setup';
import { SummaryScreen } from './ui/screens/Summary';
import { TutorialScreen } from './ui/screens/Tutorial';

function Screens() {
  const { state } = useApp();
  const { screen, session, profile } = state;
  if (!profile) return <HomeScreen />;
  switch (screen) {
    case 'play': {
      if (!session) return <HomeScreen />;
      const sc = session.items[session.index].scenario;
      // 問題が変わったら作り直す
      return <PlayScreen key={`${session.index}-${sc.seed}`} />;
    }
    case 'result':
      return session?.records.length ? <ResultScreen /> : <HomeScreen />;
    case 'summary':
      return session ? <SummaryScreen /> : <HomeScreen />;
    case 'tutorial':
      return <TutorialScreen />;
    case 'setup':
      return <SetupScreen />;
    case 'records':
      return <RecordsScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <HomeScreen />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <main className="app">
        <Screens />
      </main>
    </AppProvider>
  );
}
