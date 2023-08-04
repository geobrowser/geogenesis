import { SmallButton } from '~/design-system/button';

interface Props {
  onDismiss: () => void;
  onDismissForever: () => void;
}

export function PersonalSpaceOnboarding({ onDismissForever, onDismiss }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded border border-grey-02 shadow-button p-4">
      <h2 className="text-smallTitle">This is your Personal Space!</h2>
      <p className="text-quote">
        Update your profile details and view your activity here. Your profile is private by default, but when you join
        another Space your profile becomes publicly visible forever.
      </p>
      <div className="flex items-center justify-between">
        <SmallButton onClick={onDismiss}>Remind me later</SmallButton>
        <SmallButton onClick={onDismissForever}>Dismiss forever</SmallButton>
      </div>
    </div>
  );
}
