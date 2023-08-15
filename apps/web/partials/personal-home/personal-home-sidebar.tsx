// stubbing this out for now to get a feel for the io
import { PersonalHomeSidebarCard } from './personal-home-sidebar-card';

export function PersonalHomeSidebar() {
  return (
    <div className="flex flex-col gap-3 max-w-[300px]">
      <PersonalHomeSidebarCard title="Active proposals" amount="1" />
      <PersonalHomeSidebarCard title="Completed proposals" amount="242" />
      <PersonalHomeSidebarCard title="Member requests" amount="340" />
      <PersonalHomeSidebarCard title="Editor requests" amount="1" />
    </div>
  );
}
