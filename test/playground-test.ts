import { ethers } from "hardhat";
import { Signer, ContractFactory, Contract, BigNumber } from "ethers";
import { expect } from "chai";

describe("Smart contract playground test suite", () => {
  let accounts: Signer[];
  let contractInstance: Contract, tokenInstance: Contract;
  let owner: Signer, depositAddr: Signer, addr1: Signer, addr2: Signer, addr3: Signer;
  const zeroAddress: string = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    [owner, depositAddr, addr1, addr2, addr3] = accounts;
    const playgroundContract: ContractFactory = await ethers.getContractFactory("Playground");
    contractInstance = await playgroundContract.deploy(await depositAddr.getAddress());
    await contractInstance.deployed();
    const tokenContract: ContractFactory = await ethers.getContractFactory("vaultToken");
    tokenInstance = await tokenContract.deploy(contractInstance.address);
    await tokenInstance.deployed();
  });

  it("Should initialize the state variables correctly", async () => {
    expect(await contractInstance.owner()).to.equal(await owner.getAddress());
    expect(await contractInstance.getDepositAddress()).to.equal(await depositAddr.getAddress());
  });

  it("should be able to accept ether deposit from user after deploying the contract", async () => {
    const initialBalance: BigNumber = await depositAddr.getBalance();
    const depositAmount: BigNumber = ethers.utils.parseEther("1.2");
    const depositAmount1: BigNumber = ethers.utils.parseEther("1");

    expect(await contractInstance.connect(addr1).depositEth({ value: depositAmount }))
      .to.emit(contractInstance, "ethDeposited")
      .withArgs(await addr1.getAddress(), depositAmount);
    expect(await contractInstance.connect(addr2).depositEth({ value: depositAmount1 }))
      .to.emit(contractInstance, "ethDeposited")
      .withArgs(await addr2.getAddress(), depositAmount1);

    const isTopTen1 = await contractInstance.isTopTen(addr1.getAddress());
    const isTopTen2 = await contractInstance.isTopTen(addr2.getAddress());
    const isTopTen3 = await contractInstance.isTopTen(addr3.getAddress());

    expect(await contractInstance.getBalance(addr1.getAddress())).to.equal(depositAmount);
    expect(await contractInstance.getBalance(addr2.getAddress())).to.equal(depositAmount1);
    expect(await contractInstance.getTotalEth()).to.equal(depositAmount.add(depositAmount1));
    expect(await contractInstance.getTotalShares()).to.equal(depositAmount.add(depositAmount1));
    expect(await depositAddr.getBalance()).to.equal(depositAmount.add(initialBalance).add(depositAmount1));
    expect(await contractInstance.getTotalDepositors()).to.equal("2");
    expect(isTopTen1[0]).to.equal(true);
    expect(`${isTopTen1[1]}`).to.equal("0");
    expect(isTopTen2[0]).to.equal(true);
    expect(`${isTopTen2[1]}`).to.equal("1");
    expect(isTopTen3[0]).to.equal(false);
    expect(`${isTopTen3[1]}`).to.equal("-1");
    expect((await contractInstance.getTopTen())[0]).to.equal(await addr1.getAddress());
    expect((await contractInstance.getTopTen())[1]).to.equal(await addr2.getAddress());
  });

  describe("only owner functions", () => {
    it("only owner should be able to assign vault token once", async () => {
      await expect(contractInstance.connect(addr1).assignToken(tokenInstance.address)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(contractInstance.getVaultAddress()).to.be.revertedWith("vault token not set");
      expect(await contractInstance.assignToken(tokenInstance.address))
        .to.emit(contractInstance, "vaultAssigned")
        .withArgs(tokenInstance.address);
      expect(await contractInstance.getVaultAddress()).to.equal(tokenInstance.address);
      await expect(contractInstance.assignToken(tokenInstance.address)).to.be.revertedWith(
        "vault token can only be assigned once"
      );
    });

    it("only owner should start claiming process", async () => {
      expect(await contractInstance.canClaimToken()).to.equal(false);
      await expect(contractInstance.connect(addr1).beginClaim()).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(contractInstance.beginClaim()).to.be.revertedWith("vault token has not been assigned yet");
      await contractInstance.assignToken(tokenInstance.address);
      await expect(contractInstance.connect(addr1).beginClaim()).to.be.revertedWith("Ownable: caller is not the owner");
      await contractInstance.beginClaim();
      expect(await contractInstance.canClaimToken()).to.equal(true);
    });
  });

  describe("Claiming vault token", async () => {
    it("should revert when the claiming process hasnt started", async () => {
      const depositAmount: BigNumber = ethers.utils.parseEther("1.2");
      await contractInstance.connect(addr1).depositEth({ value: depositAmount });
      await expect(contractInstance.connect(addr1).claim()).to.be.revertedWith("claiming phase has not started");
    });

    it("should revert when an address without a share tries to claim token", async () => {
      await contractInstance.assignToken(tokenInstance.address);
      await contractInstance.beginClaim();
      await expect(contractInstance.connect(addr1).claim()).to.be.revertedWith("You dont have any shares");
    });

    it("should claim the correct amount when the claiming process has started and user has a share", async () => {
      const depositAmount: BigNumber = ethers.utils.parseEther("1.2");
      const depositAmount1: BigNumber = ethers.utils.parseEther("1");
      const initialVaultBalance: BigNumber = await tokenInstance.balanceOf(contractInstance.address);
      await contractInstance.connect(addr1).depositEth({ value: depositAmount });
      await contractInstance.connect(addr2).depositEth({ value: depositAmount1 });
      await contractInstance.assignToken(tokenInstance.address);
      await contractInstance.beginClaim();
      const expectedTokenAmount = depositAmount
        .mul(1000)
        .div(depositAmount.add(depositAmount1))
        .mul(await tokenInstance.balanceOf(contractInstance.address))
        .div(1000);
      await contractInstance.connect(addr1).claim();
      const expectedTokenAmount1 = depositAmount1
        .mul(1000)
        .div(depositAmount.add(depositAmount1))
        .mul(await tokenInstance.balanceOf(contractInstance.address))
        .div(1000);
      await contractInstance.connect(addr2).claim();
      expect(await tokenInstance.balanceOf(await addr1.getAddress())).to.equal(expectedTokenAmount);
      expect(await tokenInstance.balanceOf(await addr2.getAddress())).to.equal(expectedTokenAmount1);
      expect(await tokenInstance.balanceOf(contractInstance.address)).to.equal(
        initialVaultBalance.sub(expectedTokenAmount1).sub(expectedTokenAmount)
      );
      expect(await contractInstance.getBalance(await addr1.getAddress())).to.equal("0");
      expect(await contractInstance.getBalance(await addr2.getAddress())).to.equal("0");
      expect(await contractInstance.getTotalShares()).to.equal("0");
    });
  });

  it("should compile the top ten addresses correctly", async () => {
    const depositAmount1: BigNumber = ethers.utils.parseEther("1.2");
    const depositAmount2: BigNumber = ethers.utils.parseEther("2");
    const depositAmount3: BigNumber = ethers.utils.parseEther("0.5");
    const depositAmount4: BigNumber = ethers.utils.parseEther("1.5");
    const depositAmount5: BigNumber = ethers.utils.parseEther("2.3");
    await contractInstance.connect(addr1).depositEth({ value: depositAmount1 });
    await contractInstance.connect(addr2).depositEth({ value: depositAmount2 });
    await contractInstance.connect(addr3).depositEth({ value: depositAmount3 });
    await contractInstance.connect(accounts[5]).depositEth({ value: depositAmount4 });
    await contractInstance.connect(accounts[6]).depositEth({ value: depositAmount5 });
    let topTen: string[] = await contractInstance.getTopTen();

    expect(topTen[0]).to.equal(await accounts[6].getAddress());
    expect(topTen[1]).to.equal(await addr2.getAddress());
    expect(topTen[2]).to.equal(await accounts[5].getAddress());
    expect(topTen[3]).to.equal(await addr1.getAddress());
    expect(topTen[4]).to.equal(await addr3.getAddress());
    expect(topTen[5]).to.equal(zeroAddress);
    await contractInstance.connect(addr3).depositEth({ value: ethers.utils.parseEther("2") });

    topTen = await contractInstance.getTopTen();
    let isTopTen = await contractInstance.isTopTen(addr3.getAddress());
    expect(topTen[0]).to.equal(await addr3.getAddress());
    expect(topTen[1]).to.equal(await accounts[6].getAddress());
    expect(topTen[2]).to.equal(await addr2.getAddress());
    expect(topTen[3]).to.equal(await accounts[5].getAddress());
    expect(topTen[4]).to.equal(await addr1.getAddress());
    expect(topTen[5]).to.equal(zeroAddress);
    expect(isTopTen[0]).to.equal(true);
    expect(isTopTen[1]).to.equal(0);
  });
});
