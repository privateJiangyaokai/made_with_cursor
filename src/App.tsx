import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectPage } from './pages/ProjectPage';

const AppContent = () => {
  const { token } = useAuth();
  const [projectId, setProjectId] = useState<string | null>(null);

  if (!token) return <AuthPage />;

  if (projectId) {
    return <ProjectPage projectId={projectId} onBack={() => setProjectId(null)} />;
  }

  return <DashboardPage onSelectProject={setProjectId} />;
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
