import { IdCard } from 'lucide-solid';

/**
 * The app name. In the top bar on larger screens; on phones it moves to the top of
 * the Data page instead, to leave more room on the Design and Print pages.
 */
export default function Brand(props: { class: string; testId?: string }) {
  return (
    <div class={`brand ${props.class}`} data-testid={props.testId}>
      <IdCard size={22} aria-hidden="true" />
      <span>Card Maker</span>
    </div>
  );
}
