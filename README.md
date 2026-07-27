The provided code was a part of the Professional Experience Design Project at Uni Siegen under the supervision of Prof. Kristof Van Laerhoven.

It is an optimized version of the WEAR dataset collection and annotation pipeline by Bock et al. [1]. 

*data collection*
The Javascript files are for the bangle js.1 watches. Bangle_master.js is for the Right Hand watch which acts as the master to start and stop the recordings. Bangle_slaves.js are for the rest of the 3 watches. the .bin files can then be downloaded and converted to .csv at i29.informatik.uni-siegen.de/upload/


*labelling* 
Optimized annotator.py lets you upload the 4 watch .csv files and an excel file with the exercises and their duration logged in it (please refer to exercise.xlsx) which then helps generate labels for the recorded data.

- Please change the name of the files.
- Click on the first highest peak (of a standard action performed such as jumps) in the plots of all 4 watches' data to align them, close window to save and it will continue.
- Adjust the activity envelopes according to the peaks, close window to save the labelled dataset.

# Contact
- Amna.Shaikh@student.uni-siegen.de
- Oscar.JimenezMartinez@student.uni-siegen.de


# Reference
[1] Bock, M., Kuehne, H., Van Laerhoven, K., & Moeller, M. (2024). Wear: An outdoor sports dataset for wearable and egocentric activity recognition. Proceedings of the ACM on Interactive, Mobile, Wearable and Ubiquitous Technologies, 8(4), 1-21. 
