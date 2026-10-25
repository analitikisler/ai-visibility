// Answers explorer query: paged answers with every filter `GET /projects/:id/responses` accepts.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type ResponsesParams } from '@/lib/api';

export type AnswerQuery = ResponsesParams;

/** Paged answers. The key lives under ['p', id, 'responses'] so runs and config changes invalidate it. */
export function useAnswers(projectId: string, p: AnswerQuery) {
  return useQuery({
    queryKey: ['p', projectId, 'responses', 'search', p] as const,
    queryFn: () => api.listResponses(projectId, p),
    enabled: !!projectId,
    placeholderData: keepPreviousData,
  });
}
