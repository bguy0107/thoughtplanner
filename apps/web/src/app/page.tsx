import { redirect } from 'next/navigation'

// Root redirects to the app shell; middleware handles unauthenticated users
export default function Root() {
  redirect('/home')
}
