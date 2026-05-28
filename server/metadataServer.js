import express from "express";
import cors from "cors";
import { ethers } from "ethers";

const app = express();

app.use(cors());

const PORT = process.env.PORT || 3001;

const RPC_URL = "https://mainnet.base.org";

const CUSTOM_IMAGE_CONTRACT = "0x2AfBa0f66CAfCc69161c7a14f5aBBa0014d43911";

const ORIGINAL_BASE_URI =
  "https://young-rattlesnake-78wwa.lighthouseweb3.xyz/ipfs/bafybeibjhuypss67sixkxcioknasckg7s5slfzwuboznrmfcgbfxxys6pq/";

const provider = new ethers.JsonRpcProvider(RPC_URL);

const CUSTOM_IMAGE_ABI = [
  "function customized(uint256 tokenId) view returns (bool)",
  "function getCustomImage(uint256 tokenId) view returns (string)"
];

const customImageContract = new ethers.Contract(
  CUSTOM_IMAGE_CONTRACT,
  CUSTOM_IMAGE_ABI,
  provider
);

function ipfsToHttp(uri) {
  if (!uri) return "";

  if (uri.startsWith("ipfs://")) {
    return uri.replace(
      "ipfs://",
      "https://ipfs.io/ipfs/"
    );
  }

  return uri;
}

function ipfsToWorkingLighthouseGateway(uri) {
  if (!uri) return "";

  if (uri.startsWith("ipfs://")) {
    return uri.replace(
      "ipfs://",
      "https://retail-junglefowl-ianow.lighthouseweb3.xyz/ipfs/"
    );
  }

  return uri;
}

app.get("/api/metadata/:tokenId", async (req, res) => {
  try {
    const tokenId = req.params.tokenId;

    const originalUrl = `${ORIGINAL_BASE_URI}${tokenId}`;

    const originalMetadata = await fetch(
      ipfsToHttp(originalUrl)
    ).then((r) => r.json());

const customized =
  await customImageContract.customized(tokenId);

    if (!customized) {
      return res.json(originalMetadata);
    }

    const customImage =
      await customImageContract.getCustomImage(tokenId);

    const attributes = Array.isArray(
      originalMetadata.attributes
    )
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