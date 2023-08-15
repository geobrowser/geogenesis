import { PersonalHomeUserInfo } from '~/partials/personal-home/personal-home-user-info';

export default function PersonalSpace() {
  return (
    <div className="flex flex-col">
      <div className="flex flex-row">
        <PersonalHomeUserInfo />
      </div>
    </div>
  );
}
