import { Entity } from './entity';

export default function Test() {
  return (
    <div className="flex flex-col gap-2">
      <Entity id="1" />
      <Entity id="2" />
      <Entity id="3" />
    </div>
  );
}
