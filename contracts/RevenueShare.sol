// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Holder revenue share for $creations: a cumulative Merkle distributor.
//
// Each month the studio works out, off-chain, what every holder has earned in total since the start (see
// scripts/revshare-epoch.mjs), sends that month's pool of $creations to this contract, and publishes the Merkle root
// of the new running totals. A holder claims whenever they like: the contract pays the difference between their
// running total and what they have already claimed, so nothing expires and missed months simply add up.
//
// Holders never lock or deposit anything. Their tokens stay in their own wallet the whole time.
//
// Trust model, in plain terms:
//   - the owner can only ADD to what is owed (totals never go down), and cannot publish a root the contract
//     does not hold the tokens to pay out in full;
//   - there is no withdraw: tokens sent here can only ever leave through claims;
//   - the owner decides who is owed what. That is checked in public instead: the full list of running totals is
//     published next to the root (public/revshare/tree.json), so anyone can rebuild the root and compare.
//
// Leaves use the same encoding as OpenZeppelin's StandardMerkleTree with types ['address', 'uint256']:
//   leaf = keccak256(bytes.concat(keccak256(abi.encode(account, cumulativeAmount))))
// and pairs are hashed in sorted order.

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract RevenueShare {
    IERC20 public immutable token;
    address public owner;

    bytes32 public merkleRoot;
    uint256 public epoch;            // how many roots have been published
    uint256 public totalAllocated;   // sum of every holder's running total in the current root
    uint256 public totalClaimed;     // sum of everything paid out so far
    mapping(address => uint256) public claimed;

    event Published(uint256 indexed epoch, bytes32 merkleRoot, uint256 totalAllocated);
    event Claimed(address indexed account, uint256 amount, uint256 cumulativeAmount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error ZeroAddress();
    error TotalWentDown();
    error NotFunded(uint256 needed, uint256 available);
    error InvalidProof();
    error NothingToClaim();
    error TransferFailed();

    constructor(IERC20 token_, address owner_) {
        if (address(token_) == address(0) || owner_ == address(0)) revert ZeroAddress();
        token = token_;
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // Publish the running totals after a month closes. Send the month's pool to this contract FIRST: the call
    // reverts unless the tokens held here cover everything owed and not yet claimed.
    function publish(bytes32 root, uint256 newTotalAllocated) external onlyOwner {
        if (newTotalAllocated < totalAllocated) revert TotalWentDown();
        uint256 available = token.balanceOf(address(this)) + totalClaimed;
        if (available < newTotalAllocated) revert NotFunded(newTotalAllocated, available);

        merkleRoot = root;
        totalAllocated = newTotalAllocated;
        epoch += 1;
        emit Published(epoch, root, newTotalAllocated);
    }

    // Pays `account` everything it is owed and has not claimed yet. Anyone may call it (a relayer, a friend paying
    // the gas), but the tokens always go to `account`.
    function claim(address account, uint256 cumulativeAmount, bytes32[] calldata proof) external {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, cumulativeAmount))));
        if (!_verify(proof, merkleRoot, leaf)) revert InvalidProof();

        uint256 already = claimed[account];
        if (cumulativeAmount <= already) revert NothingToClaim();
        uint256 amount = cumulativeAmount - already;

        claimed[account] = cumulativeAmount;
        totalClaimed += amount;
        _safeTransfer(account, amount);
        emit Claimed(account, amount, cumulativeAmount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf) private pure returns (bool) {
        bytes32 hash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            hash = hash < p ? keccak256(abi.encodePacked(hash, p)) : keccak256(abi.encodePacked(p, hash));
        }
        return hash == root;
    }

    // Works with tokens that return nothing from transfer() as well as those that return a bool.
    function _safeTransfer(address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
