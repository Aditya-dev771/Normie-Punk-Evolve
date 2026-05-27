import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import "./App.css";

const NFT_CONTRACT = "0xdeff04cc85d9cfe5b4b9dbce03129491d93f213c";
const EVOLUTION_CONTRACT = "0x28d578E7F57dF6ef2A4365D605bAD4e6F2dabdB0";
const PIXEL_STORAGE_CONTRACT = "0xB9ECb745d07d0Bb742D67E986f098c5EF9D98C02";
const GRID_SIZE = 24;

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
  {
    name: "editPoints",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
];

const PIXEL_STORAGE_ABI = [
  {
    name: "savePixelChanges",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      {
        name: "changes",
        type: "tuple[]",
        components: [
          { name: "x", type: "uint8" },
          { name: "y", type: "uint8" },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: "getPixelChanges",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "x", type: "uint8" },
          { name: "y", type: "uint8" },
        ],
      },
    ],
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

  const [tool, setTool] = useState("pencil");
  const [mainTokenId, setMainTokenId] = useState("");
  const [burnTokenId, setBurnTokenId] = useState("");
  const [mainImage, setMainImage] = useState("");
  const [burnImage, setBurnImage] = useState("");
  const [ownedPunks, setOwnedPunks] = useState([]);
  const [points, setPoints] = useState("0");
  const [status, setStatus] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [pixels, setPixels] = useState({});

  function togglePixel(x, y) {
    const key = `${x}-${y}`;

    setPixels((prev) => {
      const copy = { ...prev };

      if (tool === "pencil") {
        copy[key] = true;
      }

      if (tool === "eraser") {
        delete copy[key];
      }

      return copy;
    });
  }

  function downloadEvolutionImage() {
    if (!mainImage) {
      setStatus("Select Main Punk first");
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const size = 480;
    canvas.width = size;
    canvas.height = size;

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);

      const pixelSize = size / GRID_SIZE;

      Object.keys(pixels).forEach((key) => {
        const [x, y] = key.split("-").map(Number);
        ctx.fillStyle = "black";
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
      });

      const link = document.createElement("a");
      link.download = `normie-punk-${mainTokenId}-evolved.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    img.src = mainImage;
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

      if (type === "main") setMainImage(image);
      if (type === "burn") setBurnImage(image);
    } catch (err) {
      console.log(err);
      if (type === "main") setMainImage("");
      if (type === "burn") setBurnImage("");
    }
  }

  async function loadSavedPixels(tokenId) {
    try {
      if (!tokenId || !publicClient) return;

      const changes = await publicClient.readContract({
        address: PIXEL_STORAGE_CONTRACT,
        abi: PIXEL_STORAGE_ABI,
        functionName: "getPixelChanges",
        args: [BigInt(tokenId)],
      });

      const loadedPixels = {};

      changes.forEach((p) => {
        loadedPixels[`${Number(p.x)}-${Number(p.y)}`] = true;
      });

      setPixels(loadedPixels);
    } catch (err) {
      console.log(err);
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

      if (approved) return setStatus("Already approved");

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

  async function burnAndEvolve() {
    try {
      if (!mainTokenId || !burnTokenId) return setStatus("Select both Punks");
      if (!publicClient) return setStatus("Public client not ready");

      const hash = await writeContractAsync({
        address: EVOLUTION_CONTRACT,
        abi: EVOLUTION_ABI,
        functionName: "burnToEarnPoints",
        args: [BigInt(mainTokenId), BigInt(burnTokenId)],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      setStatus("Burn complete. Edit points earned.");
      await checkPoints();
      await loadOwnedPunks();
      setBurnTokenId("");
    } catch (error) {
      setStatus(error.shortMessage || error.message);
    }
  }

  async function checkPoints() {
    try {
      if (!mainTokenId) return setStatus("Select Main Punk first");
      if (!publicClient) return setStatus("Public client not ready");

      const result = await publicClient.readContract({
        address: EVOLUTION_CONTRACT,
        abi: EVOLUTION_ABI,
        functionName: "editPoints",
        args: [BigInt(mainTokenId)],
      });

      setPoints(result.toString());
      setStatus("Points loaded");
    } catch (error) {
      setStatus(error.shortMessage || error.message);
    }
  }

  async function saveEvolutionOnchain() {
    try {
      if (!mainTokenId) return setStatus("Select Main Punk first");
      if (!publicClient) return setStatus("Public client not ready");

      const changes = Object.keys(pixels).map((key) => {
        const [x, y] = key.split("-").map(Number);
        return { x, y };
      });

      setStatus("Opening save transaction...");

      const hash = await writeContractAsync({
        address: PIXEL_STORAGE_CONTRACT,
        abi: PIXEL_STORAGE_ABI,
        functionName: "savePixelChanges",
        args: [BigInt(mainTokenId), changes],
      });

      setStatus("Saving evolution onchain...");
      await publicClient.waitForTransactionReceipt({ hash });

      setStatus("Evolution saved permanently onchain");
    } catch (error) {
      setStatus(error.shortMessage || error.message);
    }
  }

  useEffect(() => {
    loadTokenImage(mainTokenId, "main");
    loadSavedPixels(mainTokenId);
  }, [mainTokenId, publicClient]);

  useEffect(() => {
    loadTokenImage(burnTokenId, "burn");
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

        <h1>Normie Punk Evolution</h1>
        <p>Burn one Punk to power up another Punk with edit points.</p>

        <a
          href="https://normiepunk.xyz"
          target="_blank"
          rel="noreferrer"
          className="back-button"
        >
          Back To Registry
        </a>
      </div>

      <div className="panel">
        <h2>1. Approve Evolution Contract</h2>
        <button onClick={approveEvolution}>Approve</button>
      </div>

      <div className="grid">
        <div className="punk-card keep">
          <p className="small-label">// MAIN VISUAL</p>
          <h2>Main Punk</h2>

          <input
            placeholder="Main Punk ID"
            value={mainTokenId}
            onChange={(e) => setMainTokenId(e.target.value)}
          />

          <div className="visual-frame">
            {mainImage ? (
              <img src={mainImage} alt="Main Punk" />
            ) : (
              <div className="empty-visual">Enter Main Punk ID</div>
            )}
          </div>

          <button onClick={checkPoints}>Load Points</button>
          <button onClick={() => setEditorOpen(true)}>Open Pixel Editor</button>
        </div>

        <div className="punk-card burn">
          <p className="small-label">// SACRIFICE VISUAL</p>
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
              <div className="empty-visual">Enter Burn Punk ID</div>
            )}
          </div>

          <button className="danger-small" onClick={() => setBurnTokenId("")}>
            Clear Burn
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>2. Burn & Evolve</h2>
        <button className="danger" onClick={burnAndEvolve}>
          Burn & Evolve
        </button>
      </div>

      <div className="panel">
        <h2>Edit Points</h2>
        <button onClick={checkPoints}>Check Points</button>
        <p className="points">{points}</p>
      </div>

      {editorOpen && (
        <div className="editor-panel">
          <h2>Pixel Editor</h2>
          <p>
            Selected Punk #{mainTokenId || "none"} | Used Pixels:{" "}
            {Object.keys(pixels).length}
          </p>

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

          <div className="pixel-editor-wrapper">
            {mainImage && (
              <img
                src={mainImage}
                className="editor-background"
                alt="Editor Background"
              />
            )}

            <div className="pixel-grid">
              {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
                const x = index % GRID_SIZE;
                const y = Math.floor(index / GRID_SIZE);
                const key = `${x}-${y}`;

                return (
                  <div
                    key={key}
                    className={`pixel ${pixels[key] ? "active" : ""}`}
                    onClick={() => togglePixel(x, y)}
                  />
                );
              })}
            </div>
          </div>

          <button onClick={saveEvolutionOnchain}>Save Onchain</button>
          <button onClick={() => setPixels({})}>Clear Changes</button>
          <button onClick={() => setEditorOpen(false)}>Close Editor</button>
          <button onClick={downloadEvolutionImage}>Download Image</button>
        </div>
      )}

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
              {punk.image && <img src={punk.image} alt={`Normie Punk ${punk.id}`} />}
              <h3>#{punk.id}</h3>
              <button onClick={() => setMainTokenId(String(punk.id))}>
                Set Main
              </button>
              <button
                className="danger-small"
                onClick={() => setBurnTokenId(String(punk.id))}
              >
                Set Burn
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="status">{status}</div>
    </div>
  );
}

export default App;
