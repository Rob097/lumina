import { redirect } from 'next/navigation';

/** Root → the Overview dashboard (the `(app)` layout gates auth + provisions the merchant). */
export default function RootPage() {
  redirect('/overview');
}
