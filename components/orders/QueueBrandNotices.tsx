import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CustomOrderQueueApi } from '@/src/api/CustomOrderQueueApi';
import { tokens } from '@/src/styles/tokens';

type Notice = Awaited<ReturnType<typeof CustomOrderQueueApi.notices>>['notices'][number];

export function QueueBrandNotices({ enabled }: { enabled: boolean }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!enabled) { setNotices([]); setOpen(false); return; }
    let alive = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await CustomOrderQueueApi.notices();
        const values = response.notices;
        if (!alive) return;
        const now = Date.parse(response.serverNow);
        const visible = values.filter((notice) => (!notice.startsAt || Date.parse(notice.startsAt) <= now)
          && (!notice.endsAt || Date.parse(notice.endsAt) > now));
        setNotices(visible); setError(false);
        // Refresh at publication boundaries, with a bounded poll for admin changes.
        const boundaries = values.flatMap((notice) => [notice.startsAt, notice.endsAt])
          .filter((date): date is string => Boolean(date)).map(Date.parse).filter((time) => time > now);
        const delay = Math.max(1000, Math.min(60000, ...boundaries.map((time) => time - now)));
        timeout = setTimeout(() => void load(), delay);
      } catch {
        if (alive) { setNotices([]); setError(true); }
      }
    };
    void load();
    return () => { alive = false; if (timeout) clearTimeout(timeout); };
  }, [enabled, retry]));
  if (!enabled || (!notices.length && !error)) return null;
  return (
    <View>
      <Button variant="secondary" title={error ? 'Retry WIEZ notices' : `📣 WIEZ brand notices (${notices.length})`} onPress={() => error ? setRetry((value) => value + 1) : setOpen(true)} />
      <AppBottomSheet visible={open} title="WIEZ brand notices" onClose={() => setOpen(false)} scrollable>
        <View style={{ gap: tokens.spacing.md }}>
          {notices.length ? notices.map((notice) => <Card key={notice.id} style={{ gap: tokens.spacing.sm }}>
            <AppText variant="subtitle">{notice.title}</AppText>
            <AppText variant="body">{notice.body}</AppText>
            {notice.endsAt ? <AppText variant="captionRegular" tone="muted">Ends {new Date(notice.endsAt).toLocaleString()}</AppText> : null}
          </Card>) : <AppText variant="body" tone="muted">There are no current notices.</AppText>}
          <AppText variant="captionRegular" tone="muted">Notices are informational. Your subscription and checkout show any configured capacity or charge changes.</AppText>
        </View>
      </AppBottomSheet>
    </View>
  );
}
