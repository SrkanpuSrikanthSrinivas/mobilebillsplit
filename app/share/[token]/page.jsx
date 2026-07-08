import Dashboard from "../../../components/Dashboard";
import { getAllData } from "../../../lib/db.mjs";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }) {
  if (params.token !== process.env.SHARE_TOKEN) notFound();
  const data = await getAllData();
  return <Dashboard readOnly initialData={data} shareToken={params.token} />;
}
