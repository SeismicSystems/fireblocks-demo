// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TestSRC20} from "../src/TestSRC20.sol";

contract Deploy is Script {
    function run() public {
        string memory privkeyStr = vm.envString("DEPLOYER_PRIVATE_KEY");
        uint256 deployerPrivkey = vm.parseUint(privkeyStr);
        address deployer = vm.addr(deployerPrivkey);

        vm.startBroadcast(deployerPrivkey);

        TestSRC20 token = new TestSRC20();
        console.log("TestSRC20 deployed at:", address(token));

        // Mint initial supply to deployer
        token.mint(deployer, suint256(1000000e18));
        console.log("Minted 1,000,000 TSRC to deployer:", deployer);

        vm.stopBroadcast();
    }
}
