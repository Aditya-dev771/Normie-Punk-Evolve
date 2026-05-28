import lighthouse from "@lighthouse-web3/sdk";

const API_KEY = "ca246eac.6dae5cd7637244a4b7671dd3e0f6d65f";

export async function uploadToIPFS(blob) {
  const file = new File([blob], "normie-punk.png", {
    type: "image/png",
  });

  const response = await lighthouse.upload(
    [file],
    API_KEY
  );

  const cid = response.data.Hash;

  return `ipfs://${cid}`;
}