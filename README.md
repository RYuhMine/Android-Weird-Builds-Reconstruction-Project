# Android-Weird-Builds-Reconstruction-Project
This is a project to reconstruct strange Android builds where there was a mistake in the build name, or the build itself was strange.

This repository contains reconstructed `repo` manifests of weird Android builds.

Following builds were reconstructed:

| Build number         | Status           | Note                   |
| :---:                |   :---:          |   :---:                |
| KRS3B                |  Done            |  Mistyped build KRS53B |
| KRS53B               |  Done             |Non-typo version of KRS3B|


Use this when it wont compile because of "a wrong API":<br>
`export WITHOUT_CHECK_API=true`

Init command:<br>
`repo init -u https://github.com/RYuhMine/Android-Weird-Builds-Reconstruction-Project -m <build>.xml --depth=1`

Useful Links
------------

* [Pre-Release Android Manifest Repository](https://github.com/froyocomb/android)
