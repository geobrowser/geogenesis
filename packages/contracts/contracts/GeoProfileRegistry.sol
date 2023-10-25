// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;

error AccountHasExistingProfileError(address account, uint256 profileId);
error ProfileDoesNotExistError();
error NotProfileOwnerError(address account, uint256 profileId);
error ExistingHomeSpaceEqualsNewHomeSpaceError(address account, address homeSpace);

struct GeoProfile {
    address homeSpace;
    address account;
    uint256 id;
}

contract GeoProfileRegistry {
    uint256 private _profileCounter = 0;
    GeoProfile[] private _geoProfiles;
    mapping(address => uint256) private _geoProfileIndex;
    mapping(address => GeoProfile) private _geoProfileByAccount;

    event GeoProfileRegistered(address account, address homeSpace, uint256 id);
    event GeoProfileHomeSpaceUpdated(address account, address homeSpace, uint256 id);

    /**
     * @dev Registers a new Profile for the caller. Only one profile per account is allowed for now.
     * 
     * @param homeSpace The address of the profile's home space. This is the space that will be used
     *                  as a link within the Geo knowledge graph. Geo apps will use this space to query
     *                  for information about the profile by default. The space can be changed by calling
     *                  `updateProfileHomeSpace` in the GeoProfileRegistry.
     */
    function registerGeoProfile(address homeSpace) public returns (uint256) {
        if (geoProfileExists(msg.sender)) {
            GeoProfile memory profile = _geoProfileByAccount[msg.sender];
            revert AccountHasExistingProfileError(msg.sender, profile.id);
        }

        uint256 profileId = ++_profileCounter;

        GeoProfile memory geoProfile =
            GeoProfile({homeSpace: homeSpace, account: msg.sender, id: profileId});

        uint256 index = _geoProfiles.length;
        _geoProfiles.push(geoProfile);
        _geoProfileIndex[msg.sender] = index;
        _geoProfileByAccount[msg.sender] = geoProfile;

        emit GeoProfileRegistered(msg.sender, homeSpace, profileId);
        return profileId;
    }

    /**
     * @dev Updates the home space of the caller's Profile. Only the owner of the Profile can
     *      update the home space for a Profile.
     * 
     *  @param homeSpace The new address of the profile's home space.
     */
    function updateProfileHomeSpace(address homeSpace) public {
       if (!geoProfileExists(msg.sender)) {
            revert ProfileDoesNotExistError();
        }

        // Only the owner of the profile can update it.        
        if (!(msg.sender == _geoProfileByAccount[msg.sender].account)) {
            revert NotProfileOwnerError(msg.sender, _geoProfileByAccount[msg.sender].id);
        }

        GeoProfile memory geoProfile = _geoProfileByAccount[msg.sender];

        if (geoProfile.homeSpace == homeSpace) {
            revert ExistingHomeSpaceEqualsNewHomeSpaceError(msg.sender, homeSpace);
        }

        geoProfile.homeSpace = homeSpace;
        _geoProfileByAccount[msg.sender] = geoProfile;
        _geoProfiles[_geoProfileIndex[msg.sender]] = geoProfile;

        emit GeoProfileHomeSpaceUpdated(msg.sender, homeSpace, geoProfile.id);
    }

    function geoProfileFor(address account)
        public
        view
        returns (GeoProfile memory)
    {
        return _geoProfileByAccount[account];
    }

    function geoProfileExists(address account) public view returns (bool) {
        return _geoProfileByAccount[account].id != 0;
    }


    function geoProfileCount() public view returns (uint256) {
        return _profileCounter;
    }

    function geoProfileAtIndex(uint256 index)
        public
        view
        returns (GeoProfile memory)
    {
        return _geoProfiles[index];
    }

    function geoProfiles(uint256 offset, uint256 limit)
        public
        view
        returns (GeoProfile[] memory)
    {
        uint256 count = geoProfileCount();
        uint256 upper = min(count - offset, limit);
        GeoProfile[] memory output = new GeoProfile[](upper);

        for (uint256 index = 0; index < upper; index++) {
            output[index] = geoProfileAtIndex(offset + index);
        }

        return output;
    }

    function min(uint256 a, uint256 b) private pure returns (uint256) {
        return a <= b ? a : b;
    }


}