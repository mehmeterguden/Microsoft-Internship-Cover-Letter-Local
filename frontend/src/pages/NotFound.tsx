import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";

export function NotFound() {
  return (
    <>
      <PageHeader
        eyebrow="404"
        title="Page not found"
        description="That route doesn't exist yet."
      />
      <Link
        to="/"
        className="inline-flex items-center rounded-[10px] bg-accent px-4 py-2 text-[13.5px] font-bold text-on-accent transition-transform hover:-translate-y-0.5"
      >
        Back home
      </Link>
    </>
  );
}
