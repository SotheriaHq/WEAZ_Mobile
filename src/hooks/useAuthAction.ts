/**
 * useAuthAction - Mobile
 * Hook to handle actions that require authentication
 * Shows a toast prompting user to login/signup if not authenticated
 */

import { useCallback } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth/AuthContext';
import { useToast } from '@/src/toast/ToastContext';

interface UseAuthActionOptions {
    /** Custom message to show in toast */
    message?: string;
    /** Where to redirect after auth (current route by default) */
    nextPath?: string;
}

/**
 * Returns a function that wraps an action requiring auth.
 * If user is not authenticated, shows toast and redirects to login.
 * 
 * @example
 * const requireAuth = useAuthAction();
 * 
 * const handleLike = () => {
 *   requireAuth(() => {
 *     // This only runs if authenticated
 *     likePost(postId);
 *   }, { message: 'Sign in to like this post' });
 * };
 */
export function useAuthAction() {
    const { status } = useAuth();
    const toast = useToast();

    const requireAuth = useCallback(
        (action: () => void | Promise<void>, options?: UseAuthActionOptions) => {
            if (status !== 'authenticated') {
                const message = options?.message || 'Please sign in to continue';
                toast.info(message);

                // Delay navigation slightly so user sees toast
                setTimeout(() => {
                    router.push({
                        pathname: '/login',
                        params: {
                            reason: 'auth_required',
                            next: options?.nextPath,
                        },
                    });
                }, 500);
                return;
            }

            // User is authenticated, execute the action
            action();
        },
        [status, toast]
    );

    return requireAuth;
}

export default useAuthAction;
