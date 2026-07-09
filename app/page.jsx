import Dashboard from "../components/Dashboard";
import { getAllData } from "../lib/db.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  let initialData = { bills: {}, payments: {} };
  let dbError = null;
  try {
    initialData = await getAllData();
  } catch (e) {
    dbError = e.message;
  }
  return <Dashboard initialData={initialData} dbError={dbError} />;
}
