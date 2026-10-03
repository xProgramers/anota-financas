import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorState, FullScreenSpinner } from '../../components/ui/States';
import { useAuth } from './AuthProvider';

/** Protege as rotas privadas e manda para o onboarding quem ainda não o concluiu. */
export function RequireAuth({ onboarding = false }: { onboarding?: boolean }) {
  const { session, profile, loading, profileError, refreshProfile } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenSpinner />;
  if (!session) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (!profile) {
    return profileError ? (
      <ErrorState message="Não foi possível carregar seu perfil." onRetry={() => void refreshProfile()} />
    ) : (
      <FullScreenSpinner />
    );
  }
  if (!onboarding && !profile.onboarded) return <Navigate to="/boas-vindas" replace />;
  if (onboarding && profile.onboarded) return <Navigate to="/" replace />;
  return <Outlet />;
}
