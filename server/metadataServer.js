import express from "express";
import cors from "cors";
import { ethers } from "ethers";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3001;

const RPC_URL = "https://mainnet.base.org";

const NFT_CONTRACT = "0xdeff04cc85d9cfe5b4b9dbce03129491d93f213c";
const CUSTOM_IMAGE_CONTRACT = "0xf5731fB1594597C3CCDe8c8825B97f7F9030C380";

const ORIGINAL_BASE_URI = "https://young-rattlesnake-78wwa.lighthouseweb3.xyz/ipfs/bafybeibjhuypss67sixkxcioknasckg7s5slfzwuboznrmfcgbfxxys6pq/";

const provider = new ethers.JsonRpcProvider(RPC_URL);

const CUSTOM_IMAGE_ABI = [
  "function isCustomized(uint256 tokenId) view returns (bool)",
  "function getCustomImage(uint256 tokenId) view returns (string)"
];

const customImageContract = new ethers.Contract(
  CUSTOM_IMAGE_CONTRACT,
  CUSTOM_IMAGE_ABI,
  provider
);

function ipfsToHttp(uri) {
  if (!uri) return "";
  return uri.startsWith("ipfs://")
    ? uri.replace("ipfs://", "https://retail-junglefowl-ianow.lighthouseweb3.xyz/ipfs/")
    : uri;
}

app.get("/api/metadata/:tokenId", async (req, res) => {
  try {
    const tokenId = req.params.tokenId;

    const originalUrl = `${ORIGINAL_BASE_URI}${tokenId}`;
    const originalMetadata = await fetch(ipfsToHttp(originalUrl)).then((r) =>
      r.json()
    );

    const customized = await customImageContract.isCustomized(tokenId);

    if (!customized) {
      return res.json(originalMetadata);
    }

    const customImage = await customImageContract.getCustomImage(tokenId);

    const attributes = Array.isArray(originalMetadata.attributes)
      ? originalMetadata.attributes
      : [];

    const alreadyHasCustomized = attributes.some(
      (trait) => trait.trait_type === "Customized"
    );

    const newAttributes = alreadyHasCustomized
      ? attributes
      : [
          ...attributes,
          {
            trait_type: "Customized",
            value: "Yes",
          },
        ];

    return res.json({
      ...originalMetadata,
      image: ipfsToWorkingLighthouseGateway(customImage),
      attributes: newAttributes,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Metadata failed",
      message: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Metadata server running on port ${PORT}`);
});