const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

/**
 * POST /api/upload
 * Upload a single image or file to Cloudinary.
 * Expects multipart/form-data with field name "file".
 * Returns { url, publicId, fileType, fileName, fileSize }
 */
const uploadFile = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file provided." });
        }

        const { mimetype, originalname, size, buffer } = req.file;

        // Determine resource_type for Cloudinary
        let resourceType = "raw"; // for generic files (pdf, doc, zip…)
        let fileType = "file";

        if (mimetype.startsWith("image/")) {
            resourceType = "image";
            fileType = "image";
        } else if (mimetype.startsWith("video/")) {
            resourceType = "video";
            fileType = "video";
        }

        // Stream buffer directly to Cloudinary (no temp file on disk)
        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: "chat-files",
                    resource_type: resourceType,
                    use_filename: true,
                    unique_filename: true,
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            streamifier.createReadStream(buffer).pipe(uploadStream);
        });

        return res.status(200).json({
            success: true,
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            fileType,
            fileName: originalname,
            fileSize: size,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { uploadFile };
