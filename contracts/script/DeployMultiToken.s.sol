// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockSRC20} from "../utils/MockSRC20.sol";
import {SRC20Multicall} from "seismic-std-lib/SRC20Multicall.sol";

contract DeployMultiToken is Script {
    uint256 constant NUM_TOKENS = 50;

    function run() public {
        string memory privkeyStr = vm.envString("DEPLOYER_PRIVATE_KEY");
        uint256 deployerPrivkey = vm.parseUint(privkeyStr);
        address deployer = vm.addr(deployerPrivkey);

        vm.startBroadcast(deployerPrivkey);

        SRC20Multicall multicall = new SRC20Multicall();
        console.log("SRC20Multicall deployed at:", address(multicall));

        for (uint256 i = 0; i < NUM_TOKENS; i++) {
            string memory name = string(abi.encodePacked("Token", vm.toString(i + 1)));
            string memory symbol = string(abi.encodePacked("TKN", vm.toString(i + 1)));
            MockSRC20 token = new MockSRC20(name, symbol, 18);
            uint256 amount = (i + 1) * 1e18;
            token.mint(deployer, suint256(amount));
            console.log("Deployed:", address(token));
        }

        vm.stopBroadcast();
    }
}
