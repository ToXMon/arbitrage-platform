/**
 * useApi hook - Generic API request hook
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useApi<T>(
  key: string[],
  endpoint: string,
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  }
) {
  return useQuery<T, Error>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      return res.json();
    },
    ...options,
  });
}

export function useApiMutation<TData, TVariables>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  options?: {
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
    invalidateKeys?: string[][];
  }
) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(variables),
      });
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      options?.onSuccess?.(data);
      if (options?.invalidateKeys) {
        options.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
    },
    onError: options?.onError,
  });
}
