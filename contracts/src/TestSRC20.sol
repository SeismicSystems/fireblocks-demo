// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.13;

import {SRC20} from "./SRC20.sol";

/// @notice Test SRC20 token with public mint for demo purposes.
contract TestSRC20 is SRC20 {
    address public admin;

    constructor() SRC20("TestSRC20", "TSRC", 18) {
        admin = msg.sender;
    }

    function mint(address to, suint256 amount) external onlyAdmin {
        _mint(to, amount);
    }

    function burn(address from, suint256 amount) external onlyAdmin {
        _burn(from, amount);
    }

    function getTotalSupply() external view returns (uint256) {
        return _totalSupply();
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "TestSRC20: caller is not admin");
        _;
    }
}
