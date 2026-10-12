import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorState, inputClass, PageHeader, panelClass, PrimaryButton, SecondaryButton } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { messageFor } from '../lib/errors';
import { assistantApi } from '../services/api';

type Turn = { role: 'user' | 'assistant'; text: string; confirmationId?: string };

const prompts = [
  'What should I order today?',
  'Which products are at risk of stockout?',
  'Which warehouse has the most critical inventory?',
  'Show me pending purchase orders.',
  "Explain today's inventory situation.",
];

export function AssistantPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function ask(text: string) {
    setPending(true);
    setError('');
    setTurns((current) => [...current, { role: 'user', text }]);
    try {
      const result = await assistantApi.chat(text);
      setTurns((current) => [
        ...current,
        {
          role: 'assistant',
          text: result.reply,
          ...(result.confirmation ? { confirmationId: result.confirmation.id } : {}),
        },
      ]);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setPending(false);
    }
  }

  async function confirm(confirmationId: string, accept: boolean) {
    setPending(true);
    try {
      const result = await assistantApi.confirm(confirmationId, accept);
      toast.push(result.reply, result.executed ? 'success' : 'error');
      setTurns((current) => [...current, { role: 'assistant', text: result.reply }]);
      if (result.executed) {
        navigate('/purchase-orders');
      }
    } catch (caught) {
      toast.push(messageFor(caught), 'error');
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessage('');
    void ask(text);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Copilot"
        title="Planner assistant"
        subtitle="Ask in plain language. Replies quote live stock, forecasts, and orders for this organization. Approving still needs the confirm button."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink shadow-sm transition hover:border-copper/40 hover:bg-mist"
            onClick={() => void ask(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
      <div className={`min-h-80 space-y-3 p-5 ${panelClass}`}>
        {turns.length === 0 ? (
          <div className="text-sm leading-6 text-stone-500">
            <p>Start with a prompt, or ask why a SKU is at risk by name.</p>
            <p className="mt-2">“Approve all of them” prepares purchase orders and waits. Nothing is ordered until you confirm.</p>
          </div>
        ) : null}
        {turns.map((turn, index) => (
          <article key={`${turn.role}-${index}`} className={turn.role === 'user' ? 'text-right' : ''}>
            <p className={`inline-block max-w-3xl rounded-2xl px-4 py-3 text-left text-sm leading-6 ${turn.role === 'user' ? 'bg-ink text-white' : 'border border-line bg-mist text-ink'}`}>
              {turn.text}
            </p>
            {turn.confirmationId ? (
              <div className="mt-2 flex justify-start gap-2">
                <SecondaryButton type="button" disabled={pending} onClick={() => void confirm(turn.confirmationId ?? '', false)}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton type="button" disabled={pending} onClick={() => void confirm(turn.confirmationId ?? '', true)}>
                  Confirm approval
                </PrimaryButton>
              </div>
            ) : null}
          </article>
        ))}
        {pending ? <p className="text-sm text-stone-500">Looking up live data…</p> : null}
        {error ? <ErrorState message={error} /> : null}
      </div>
      <form className="mt-4 flex gap-2" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="assistant-message">Message</label>
        <input
          id="assistant-message"
          className={inputClass}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask about stock, orders, or risk"
        />
        <PrimaryButton type="submit" disabled={pending}>Send</PrimaryButton>
      </form>
    </div>
  );
}
