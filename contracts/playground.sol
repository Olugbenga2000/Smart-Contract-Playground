//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


contract Playground is Ownable {
    address private immutable depositAddress;
    mapping(address => uint) balanceOf;
    uint private constant decimal = 18;
    uint private totalShares;
    uint private totalEth;
    uint private numOfDepositors;
    IERC20 private vaultToken;
    bool private startClaim;
    address[10] private topTen;


    event ethDeposited(address indexed sender, uint indexed value);
    event vaultAssigned(address indexed vault);
    event vaultTokenClaimed(address indexed receiver, uint indexed value);
    event claimStarted();

    constructor(address deposit){
        depositAddress = deposit;
    }



    function depositEth() external payable{
        uint fee = msg.value;
        require(fee > 0, "cannot deposit 0 eth");
        require(startClaim == false, "cannot deposit");

        if(balanceOf[msg.sender] == 0){
            numOfDepositors++ ;
        }

        balanceOf[msg.sender] += fee;
        totalShares += fee;
        totalEth += fee;

        if(balanceOf[msg.sender] > balanceOf[topTen[9]]){
        compileTopTen(); 
        }

        (bool success, ) = depositAddress.call{value: fee}("");
        require(success, "failed to send");
        emit ethDeposited(msg.sender, fee);
        

    }

    function assignToken(address _token) external onlyOwner{
        require(address(vaultToken) == address(0), "vault token can only be assigned once");
        vaultToken = IERC20(_token);
        emit vaultAssigned(_token);
    }

    function claim() external {
        require(startClaim == true, "claiming phase has not started");
        uint balance = balanceOf[msg.sender];
        require(balance > 0, "You dont have any shares");
        balanceOf[msg.sender] = 0;
        totalShares -= balance;
        uint percent = (balance * 1000)/ totalEth;
        uint totalVaultTokenBalance = vaultToken.balanceOf(address(this));
        uint userTokenBalance = (percent * totalVaultTokenBalance) / 1000;
        
        require(vaultToken.transfer(msg.sender, userTokenBalance), "failed to send token to user");
        emit vaultTokenClaimed(msg.sender, userTokenBalance);

    }

     function beginClaim() external onlyOwner{
        require(address(vaultToken) != address(0), "vault token has not been assigned yet");
        startClaim = true;
        emit claimStarted();
    }

    function compileTopTen() private {
        uint userBalance = balanceOf[msg.sender];
        (bool status, int currentIndex) = isTopTen(msg.sender);
        if(status == false){
            for(uint i = 8; i>=0; i--){
                if(userBalance <= balanceOf[topTen[i]]){
                    for(uint j = 9; j > i+1; j--){
                        topTen[j] = topTen[j-1];
                    }
                    topTen[i+1] = msg.sender;
                    break;
                }

                else if(i == 0){
                    for(uint j = 9; j > i; j--){
                        topTen[j] = topTen[j-1];
                    }
                    topTen[i] = msg.sender;
                    break;
                }

            }
        }
    // To prevent duplicate entries when an address is in the top ten already

        else {
            for(uint i = uint(currentIndex) - 1; i>=0; i--){
                if(userBalance <= balanceOf[topTen[i]]){
                    for(uint j = uint(currentIndex); j > i+1; j--){
                        topTen[j] = topTen[j-1];
                    }
                    topTen[i+1] = msg.sender;
                    break;
                }

                else if(i == 0){
                    for(uint j = uint(currentIndex); j > i; j--){
                        topTen[j] = topTen[j-1];
                    }
                    topTen[i] = msg.sender;
                    break;
                }
        }
    }
}

    function isTopTen(address addr) public view returns(bool, int){
        for(uint i = 0; i < topTen.length; i++){
            if(topTen[i] == addr){
                return (true, int(i));
            }
        }
        return (false, -1);
    }

    function getBalance(address sender) external view returns(uint){
        return balanceOf[sender];
    }


    function getTopTen() external view returns (address[10] memory){
        return topTen;
    } 

    function getDecimal() external pure returns (uint){
        return decimal;
    } 

    function getTotalShares() external view returns (uint){
        return totalShares;
    } 

    function getTotalEth() external view returns (uint){
        return totalEth;
    } 

    function getTotalDepositors() external view returns (uint){
        return numOfDepositors;
    } 

    function getDepositAddress() external view returns (address){
        return depositAddress;
    } 

    function getVaultAddress() external view returns (address){
        require(address(vaultToken) != address(0), 'vault token not set');
        return address(vaultToken);
    }

    function canClaimToken() external view returns (bool){
        return startClaim;
    }

}