'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';

import { ExpertForm } from '@/components/admin/experts/ExpertForm';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditExpertPage() {
  const params = useParams<{ expertId: string }>();
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-[560px] w-full" />
        </div>
      }
    >
      <ExpertForm mode="edit" expertId={params?.expertId ?? ''} />
    </Suspense>
  );
}