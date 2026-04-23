export const UploadingPdfState = ({ cancelUploading }: { cancelUploading: () => void }) => {
  return (
    <div className="mt-[3px] flex h-[100px] w-[173px] flex-col items-center justify-center rounded-lg border border-dashed border-grey-02 px-[58px] py-[25px] text-[14px] font-medium text-[#2A2B2E]">
      <span>Uploading</span>
      <div className="mt-2 flex h-[3px] min-h-[3px] w-[41px] rounded-[40px] bg-grey-02">
        <div className="h-full w-[33px] rounded-[40px] bg-[#2A2B2E]"></div>
      </div>
      <button onClick={cancelUploading} className="mt-[10px] text-[11px] text-grey-04">
        Cancel
      </button>
    </div>
  );
};
