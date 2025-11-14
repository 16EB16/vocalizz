import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ModelCardSkeleton = () => {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex justify-between items-start mb-2">
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-6 w-1/5" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/6" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-3 w-1/12" />
          </div>
          <Skeleton className="h-2 w-full" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-10" />
        </div>
      </CardContent>
    </Card>
  );
};

export default ModelCardSkeleton;