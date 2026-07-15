import { Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";
import { Page } from "@/components/common/Page";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <Page eyebrow="Error / 404" title="Page not found">
      <EmptyState
        icon={<FileQuestion size={24} />}
        title="This page doesn't exist"
        description="The route you followed isn't part of the app. Head back and pick up where you left off."
        action={
          <Button asChild>
            <Link to="/">Back to Home</Link>
          </Button>
        }
      />
    </Page>
  );
}
