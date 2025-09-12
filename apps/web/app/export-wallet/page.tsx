import { ExportWalletButton } from './export-wallet';

export const dynamic = 'force-dynamic';

export default function ExportWalletPage() {
  return (
    <div className="mx-auto w-full max-w-[880px]">
      <h1 className="mb-4 text-mainPage text-text">Export Wallet</h1>
      <ExportWalletButton />
    </div>
  );
}
