import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import "./App.css";
import { uploadToIPFS } from "./uploadToIPFS";

const NFT_CONTRACT = "0xdeff04cc85d9cfe5b4b9dbce03129491d93f213c";
const EVOLUTION_CONTRACT = "0x28d578E7F57dF6ef2A4365D605bAD4e6F2dabdB0";
const CUSTOM_IMAGE_CONTRACT = "0x127517ecEf8B31fa6Df2Bf784FA090E3905F3115";

const CANVAS_UNLOCKS = [
  { label: "24x24", size: 24, cost: 50 },
  { label: "64x64", size: 64, cost: 400 },
  { label: "128x128", size: 128, cost: 2000 },
];

const NFT_ABI = [
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
];

const EVOLUTION_ABI = [
  {
    name: "burnToEarnPoints",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mainTokenId", type: "uint256" },
      { name: "burnTokenId", type: "uint256" },
    ],
    outputs: [],
  },
];

const CUSTOM_IMAGE_ABI = [
  {
    name: "setCustomImage",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "imageURI", type: "string" },
      { name: "cost", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "availablePoints",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
];

function ipfsToHttp(url) {
  if (!url) return "";
  return url.startsWith("ipfs://")
    ? url.replace("ipfs://", "https://ipfs.io/ipfs/")
    : url;
}

function App() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [activeTab, setActiveTab] = useState("burn");
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [burnTokenId, setBurnTokenId] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [burnImage, setBurnImage] = useState("");
  const [ownedPunks, setOwnedPunks] = useState([]);
  const [points, setPoints] = useState("0");
  const [status, setStatus] = useState("");

  const [gridSize, setGridSize] = useState(24);
  const [tool, setTool] = useState("pencil");
  const [pixels, setPixels] = useState({});

  function togglePixel(x, y) {
    const key = `${x}-${y}`;

    setPixels((prev) => {
      const copy = { ...prev };

      if (tool === "pencil") copy[key] = true;
      if (tool === "eraser") delete copy[key];

      return copy;
    });
  }

  async function loadTokenImage(tokenId, type) {
    try {
      if (!tokenId || !publicClient) return;

      const uri = await publicClient.readContract({
        address: NFT_CONTRACT,
        abi: NFT_ABI,
        functionName: "tokenURI",
        args: [BigInt(tokenId)],
      });

      const metadata = await fetch(ipfsToHttp(uri)).then((r) => r.json());
      const image = ipfsToHttp(metadata.image);

      if (type === "selected") setSelectedImage(image);
      if (type === "burn") setBurnImage(image);
    } catch (err) {
      console.log(err);
      if (type === "selected") setSelectedImage("");
      if (type === "burn") setBurnImage("");
    }
  }

  async function loadOwnedPunks() {
    if (!address) return;

    try {
      setStatus("Loading your Normie Punks...");

      const url = `https://base-mainnet.g.alchemy.com/nft/v3/u7hGUvpFPsD19f54Tty3I/getNFTsForOwner?owner=${address}&contractAddresses[]=${NFT_CONTRACT}`;
      const res = await fetch(url);
      const data = await res.json();

      const punks = (data.ownedNfts || []).map((nft) => ({
        id: nft.tokenId,
        image: nft.image?.cachedUrl || nft.image?.pngUrl || "",
      }));

      setOwnedPunks(punks);
      setStatus(`Loaded ${punks.length} Normie Punk(s)`);
    } catch (err) {
      console.log(err);
      setStatus("Failed to load owned Punks");
    }
  }

  async function approveEvolution() {
    try {
      if (!address) return setStatus("Connect wallet first");
      if (!publicClient) return setStatus("Public client not ready");

      const approved = await publicClient.readContract({
        address: NFT_CONTRACT,
        abi: NFT_ABI,
        functionName: "isApprovedForAll",
        args: [address, EVOLUTION_CONTRACT],
      });

      if (approved) return setStatus("Evolution contract already approved");

      const hash = await writeContractAsync({
        address: NFT_CONTRACT,
        abi: NFT_ABI,
        functionName: "setApprovalForAll",
        args: [EVOLUTION_CONTRACT, true],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setStatus("Approval successful");
    } catch (error) {
      setStatus(error.shortMessage || error.message);
    }
  }

  async function burnAndEarnPoints() {
    try {
      if (!selectedTokenId || !burnTokenId) {
        return setStatus("Select main Punk and burn Punk first");
      }

      if (selectedTokenId === burnTokenId) {
        return setStatus("Main Punk and burn Punk cannot be same");
      }

      const hash = await writeContractAsync({
        address: EVOLUTION_CONTRACT,
        abi: EVOLUTION_ABI,
        functionName: "burnToEarnPoints",
        args: [BigInt(selectedTokenId), BigInt(burnTokenId)],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      setStatus("Burn complete. Points earned.");
      setBurnTokenId("");
      setBurnImage("");

      await checkPoints();
      await loadOwnedPunks();
    } catch (error) {
      setStatus(error.shortMessage || error.message);
    }
  }

  async function checkPoints() {
    try {
      if (!selectedTokenId) return setStatus("Select a Punk first");
      if (!publicClient) return setStatus("Public client not ready");

      const result = await publicClient.readContract({
        address: CUSTOM_IMAGE_CONTRACT,
        abi: CUSTOM_IMAGE_ABI,
        functionName: "availablePoints",
        args: [BigInt(selectedTokenId)],
      });

      setPoints(result.toString());
      setStatus("Points loaded");
    } catch (error) {
      setStatus(error.shortMessage || error.message);
    }
  }

  function selectCanvas(canvas) {
    if (Number(points) < canvas.cost) {
      setStatus(`You need ${canvas.cost} points for ${canvas.label}`);
      return;
    }

    setGridSize(canvas.size);
    setPixels({});
    setStatus(`${canvas.label} canvas selected`);
  }

  function exportCanvasBlob() {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const size = 1024;

      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }

      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);

      const pixelSize = size / gridSize;

      Object.keys(pixels).forEach((key) => {
        const [x, y] = key.split("-").map(Number);
        ctx.fillStyle = "#000000";
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
      });

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG export failed"));
          return;
        }

        resolve(blob);
      }, "image/png");
    });
  }

  async function saveCustomNFTImage() {
    try {
      if (!selectedTokenId) return setStatus("Select a Punk first");
      if (!publicClient) return setStatus("Public client not ready");

      const unlock = CANVAS_UNLOCKS.find((c) => c.size === gridSize);

      if (Number(points) < unlock.cost) {
        return setStatus(`You need ${unlock.cost} points to save ${unlock.label}`);
      }

      if (Object.keys(pixels).length === 0) {
        return setStatus("Draw something before saving");
      }

      setStatus("Exporting image...");
      const blob = await exportCanvasBlob();

      setStatus("Uploading image to Lighthouse IPFS...");
      const imageURI = await uploadToIPFS(blob);

      setStatus("Saving custom image onchain...");
      const hash = await writeContractAsync({
        address: CUSTOM_IMAGE_CONTRACT,
        abi: CUSTOM_IMAGE_ABI,
        functionName: "setCustomImage",
        args: [BigInt(selectedTokenId), imageURI, BigInt(unlock.cost)],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      await checkPoints();

      setStatus(`Custom image saved: ${imageURI}`);
    } catch (error) {
      console.log(error);
      setStatus(error.shortMessage || error.message);
    }
  }

  async function downloadImage() {
    try {
      if (Object.keys(pixels).length === 0) {
        setStatus("Draw something before downloading");
        return;
      }

      setStatus("Preparing PNG download...");

      const blob = await exportCanvasBlob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `normie-punk-${selectedTokenId || "custom"}-${gridSize}x${gridSize}.png`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      setStatus("PNG downloaded");
    } catch (error) {
      console.log(error);
      setStatus(error.message || "Download failed");
    }
  }

  useEffect(() => {
    if (selectedTokenId) {
      loadTokenImage(selectedTokenId, "selected");
      checkPoints();
    }
  }, [selectedTokenId, publicClient]);

  useEffect(() => {
    if (burnTokenId) {
      loadTokenImage(burnTokenId, "burn");
    }
  }, [burnTokenId, publicClient]);

  useEffect(() => {
    if (isConnected) loadOwnedPunks();
  }, [isConnected, address]);

  return (
    <div className="page">
      <div className="hero">
        <div className="wallet-top">
          <ConnectButton />
        </div>

        <h1>Normie Punk Evolve</h1>
        <p>Burn Punks, earn points, and create a new custom image from scratch.</p>
<div className="hero-links">
  <a
    href="https://identity.normiepunk.xyz"
    target="_blank"
    rel="noreferrer"
    className="back-button"
  >
    Go To IDENTITY
  </a>

  <a
    href="https://opensea.io/collection/normie-punk-"
    target="_blank"
    rel="noreferrer"
    className="back-button"
  >
    OpenSea
  </a>

  <a
    href="https://x.com/PunkNormie"
    target="_blank"
    rel="noreferrer"
    className="back-button"
  >
    X / Twitter
  </a>
</div>
       
      </div>

      <div className="tabs">
        <button
          className={activeTab === "burn" ? "tab-active" : ""}
          onClick={() => setActiveTab("burn")}
        >
          Burn & Points
        </button>

        <button
          className={activeTab === "punks" ? "tab-active" : ""}
          onClick={() => setActiveTab("punks")}
        >
          My Punks
        </button>

        <button
          className={activeTab === "editor" ? "tab-active" : ""}
          onClick={() => setActiveTab("editor")}
        >
          Pixel Editor
        </button>

        <button
          className={activeTab === "info" ? "tab-active" : ""}
          onClick={() => setActiveTab("info")}
        >
          How It Works
        </button>
      </div>

      <div className="selected-bar">
        <p>
          Selected Punk: <strong>{selectedTokenId || "None"}</strong>
        </p>
        <p>
          Points: <strong>{points}</strong>
        </p>
      </div>

      {activeTab === "burn" && (
        <div className="tab-panel">
          <div className="panel">
            <h2>1. Approve Evolution Contract</h2>
            <p>Approve once so the burn contract can burn your selected sacrifice Punk.</p>
            <button onClick={approveEvolution}>Approve Evolution</button>
          </div>

          <div className="grid">
            <div className="punk-card keep">
              <p className="small-label">// NFT SLOT TO CUSTOMIZE</p>
              <h2>Main Punk</h2>

              <input
                placeholder="Main Punk ID"
                value={selectedTokenId}
                onChange={(e) => setSelectedTokenId(e.target.value)}
              />

              <div className="visual-frame">
                {selectedImage ? (
                  <img src={selectedImage} alt="Selected Punk" />
                ) : (
                  <div className="empty-visual">Select Main Punk</div>
                )}
              </div>

              <button onClick={checkPoints}>Load Points</button>
            </div>

            <div className="punk-card burn">
              <p className="small-label">// NFT TO BURN</p>
              <h2>Burn Punk</h2>

              <input
                placeholder="Burn Punk ID"
                value={burnTokenId}
                onChange={(e) => setBurnTokenId(e.target.value)}
              />

              <div className="visual-frame burn-frame">
                {burnImage ? (
                  <img src={burnImage} alt="Burn Punk" />
                ) : (
                  <div className="empty-visual">Select Burn Punk</div>
                )}
              </div>

              <button className="danger-small" onClick={() => setBurnTokenId("")}>
                Clear Burn
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>2. Burn To Earn Points</h2>
            <p>1 burned NFT = 20 points.</p>
            <button className="danger" onClick={burnAndEarnPoints}>
              Burn & Earn Points
            </button>
          </div>
        </div>
      )}

      {activeTab === "punks" && (
        <div className="tab-panel">
          <div className="panel">
            <h2>Your Normie Punks</h2>
            <button onClick={loadOwnedPunks}>Reload My Normie Punks</button>

            {isConnected && ownedPunks.length === 0 && (
              <div className="no-punks">
                <h3>No Normie Punks found</h3>
                <p>You need a Normie Punk to use Burn & Evolve.</p>
                <a
                  href="https://opensea.io/collection/normie-punk-"
                  target="_blank"
                  rel="noreferrer"
                >
                  Buy on OpenSea
                </a>
              </div>
            )}

            <div className="owned-grid">
              {ownedPunks.map((punk) => (
                <div className="owned-card" key={punk.id}>
                  {punk.image && (
                    <img src={punk.image} alt={`Normie Punk ${punk.id}`} />
                  )}

                  <h3>#{punk.id}</h3>

                  <button
                    onClick={() => {
                      setSelectedTokenId(String(punk.id));
                      setActiveTab("burn");
                    }}
                  >
                    Set Main
                  </button>

                  <button
                    className="danger-small"
                    onClick={() => {
                      setBurnTokenId(String(punk.id));
                      setActiveTab("burn");
                    }}
                  >
                    Set Burn
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "editor" && (
        <div className="tab-panel">
          <div className="editor-panel">
            <h2>Pixel Editor</h2>
            <p>This is a blank canvas. It does not combine with the original Punk image.</p>

            {!selectedTokenId && (
              <div className="warning-box">
                Select a main Punk first before saving custom art.
              </div>
            )}

            <div className="canvas-unlocks">
              {CANVAS_UNLOCKS.map((canvas) => (
                <button
                  key={canvas.size}
                  disabled={Number(points) < canvas.cost}
                  className={gridSize === canvas.size ? "tool-active" : ""}
                  onClick={() => selectCanvas(canvas)}
                >
                  {canvas.label} / {canvas.cost} Points
                </button>
              ))}
            </div>

            <div className="tool-row">
              <button
                className={tool === "pencil" ? "tool-active" : ""}
                onClick={() => setTool("pencil")}
              >
                Pencil
              </button>

              <button
                className={tool === "eraser" ? "tool-active" : ""}
                onClick={() => setTool("eraser")}
              >
                Eraser
              </button>
            </div>

            <p>
              Canvas: {gridSize}x{gridSize} | Used Pixels:{" "}
              {Object.keys(pixels).length}
            </p>

            <div
              className="pixel-grid"
              style={{
                gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                gridTemplateRows: `repeat(${gridSize}, 1fr)`,
              }}
            >
              {Array.from({ length: gridSize * gridSize }).map((_, index) => {
                const x = index % gridSize;
                const y = Math.floor(index / gridSize);
                const key = `${x}-${y}`;

                return (
                  <div
                    key={key}
                    className="pixel"
                    style={{
                      backgroundColor: pixels[key] ? "#000000" : "#ffffff",
                    }}
                    onClick={() => togglePixel(x, y)}
                  />
                );
              })}
            </div>

            <div className="tool-row">
              <button onClick={saveCustomNFTImage}>Save Custom NFT Image</button>
              <button onClick={downloadImage}>Download PNG</button>
              <button onClick={() => setPixels({})}>Clear Canvas</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "info" && (
        <div className="tab-panel">
          <div className="panel">
            <h2>How Normie Punk Evolution Works</h2>

            <div className="info-section">
              <h3>Step 1 — Select Main Punk</h3>
              <p>Your Main Punk is the NFT that will receive points and custom artwork.</p>
              <div className="example-box">Example: Punk #52 = Main Punk</div>
            </div>

            <div className="info-section">
              <h3>Step 2 — Select Burn Punk</h3>
              <p>Choose another Normie Punk that you want to permanently burn.</p>
              <div className="example-box">Example: Burn Punk #91</div>
              <p>Burned NFTs are destroyed forever.</p>
            </div>

            <div className="info-section">
              <h3>Step 3 — Burn To Earn Points</h3>
              <div className="example-box">1 Burned NFT = 20 Points</div>
              <p>Points are attached to your Main Punk.</p>
            </div>

            <div className="info-section">
              <h3>Step 4 — Unlock Canvas Sizes</h3>
              <div className="example-box">
                24x24 = 50 Points
                <br />
                64x64 = 400 Points
                <br />
                128x128 = 2000 Points
              </div>
              <p>Bigger canvases allow more detailed custom creations.</p>
            </div>

            <div className="info-section">
              <h3>Step 5 — Create Custom Artwork</h3>
              <p>Use the Pixel Editor to draw a completely new evolved NFT from scratch.</p>
              <p>The original image is not layered or combined. The saved image replaces it.</p>
            </div>

            <div className="info-section">
              <h3>Step 6 — Save Onchain</h3>
              <ul>
                <li>Artwork uploads to IPFS</li>
                <li>Image URI is saved onchain</li>
                <li>Metadata updates automatically</li>
                <li>OpenSea reflects the new image after refresh</li>
                <li>Points are deducted based on selected canvas size</li>
              </ul>
            </div>

            <div className="info-section">
              <h3>Important Rules</h3>
              <ul>
                <li>Burns are permanent</li>
                <li>Points cannot be recovered after saving</li>
                <li>Token ID remains the same</li>
                <li>Custom artwork replaces the displayed NFT image</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="status">{status}</div>
    </div>
  );
}

export default App;