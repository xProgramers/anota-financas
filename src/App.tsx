import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { LoginPage } from './features/auth/LoginPage';
import { OnboardingPage } from './features/auth/OnboardingPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { SignupPage } from './features/auth/SignupPage';
import { CategoriesProvider } from './features/categories/CategoriesProvider';
import { ChatPage } from './features/chat/ChatPage';
import { ChatProvider } from './features/chat/ChatProvider';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { AppLayout } from './layouts/AppLayout';
import { isSupabaseConfigured } from './lib/supabase';

export function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20">
        <h1 className="text-xl font-semibold">Configuração incompleta</h1>
        <p className="mt-2 text-muted">
          Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja o arquivo <code>.env.example</code>) e reinicie o app.
        </p>
      </div>
    );
  }

  return (
    <AuthProvider>
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/cadastro" element={<SignupPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

        <Route element={<RequireAuth onboarding />}>
          <Route path="/boas-vindas" element={<OnboardingPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route
            element={
              <CategoriesProvider>
                <ChatProvider>
                  <AppLayout />
                </ChatProvider>
              </CategoriesProvider>
            }
          >
            <Route index element={<ChatPage />} />
            <Route path="/resumo" element={<DashboardPage />} />
            <Route path="/transacoes" element={<TransactionsPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
