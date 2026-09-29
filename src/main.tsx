import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/lib/auth'
import {
  countDehydrateOptions,
  countPersister,
  createAppQueryClient,
  resumeCountWrites,
} from '@/lib/count-queue'

const queryClient = createAppQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: countPersister,
        dehydrateOptions: countDehydrateOptions,
      }}
      onSuccess={() => resumeCountWrites(queryClient)}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)
