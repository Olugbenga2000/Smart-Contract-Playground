//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract vaultToken is ERC20{

    constructor(address playground) ERC20("MOCKTOKEN", "MCK"){
        _mint(playground, 10**22);
    }
}